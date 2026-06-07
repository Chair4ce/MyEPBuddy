-- Credit system security hardening:
-- 1. Caller identity checks on usage RPCs
-- 2. Stripe checkout session idempotency (prevent double-grant)
-- 3. Style signature app-key daily quota (non-billable background feature)

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_checkout_session
  ON credit_transactions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Replace grant_credits (adding a param creates an overload in Postgres)
DROP FUNCTION IF EXISTS grant_credits(UUID, INT, credit_transaction_type, TEXT, TEXT);

CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount INT,
  p_type credit_transaction_type,
  p_stripe_event_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_stripe_checkout_session_id TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_new_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant amount must be positive';
  END IF;

  -- Idempotent grant for Stripe webhooks (same checkout session)
  IF p_stripe_checkout_session_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
    ) THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  -- Idempotent grant for Stripe webhooks (same event retried)
  IF p_stripe_event_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE stripe_event_id = p_stripe_event_id
    ) THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
  VALUES (
    p_user_id,
    p_amount,
    p_type = 'trial',
    CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    0
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = user_credits.balance + p_amount,
    trial_granted = user_credits.trial_granted OR (p_type = 'trial'),
    lifetime_purchased = user_credits.lifetime_purchased +
      CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    stripe_event_id,
    stripe_checkout_session_id,
    description
  ) VALUES (
    p_user_id,
    p_type,
    p_amount,
    v_new_balance,
    p_stripe_event_id,
    p_stripe_checkout_session_id,
    p_description
  );

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION consume_credit(
  p_user_id UUID,
  p_action_type TEXT,
  p_model_id TEXT,
  p_provider TEXT,
  p_burst_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burst_count INT;
  v_one_minute_ago TIMESTAMPTZ;
  v_balance INT;
  v_new_balance INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_one_minute_ago := now() - INTERVAL '60 seconds';

  SELECT COUNT(*) INTO v_burst_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at >= v_one_minute_ago;

  IF v_burst_count >= p_burst_limit THEN
    RETURN -1;
  END IF;

  INSERT INTO user_credits (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN -2;
  END IF;

  v_new_balance := v_balance - 1;

  UPDATE user_credits SET
    balance = v_new_balance,
    lifetime_consumed = lifetime_consumed + 1,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (
    user_id, type, amount, balance_after, action_type, model_id
  ) VALUES (
    p_user_id, 'consume', -1, v_new_balance, p_action_type, p_model_id
  );

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, p_action_type, true, p_model_id, p_provider);

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION check_and_record_usage(
  p_user_id UUID,
  p_action_type TEXT,
  p_used_default_key BOOLEAN,
  p_model_id TEXT,
  p_provider TEXT,
  p_weekly_limit INT DEFAULT 20,
  p_burst_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start TIMESTAMPTZ;
  current_count INT;
  burst_count INT;
  one_minute_ago TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  week_start := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  one_minute_ago := now() - INTERVAL '60 seconds';

  SELECT COUNT(*) INTO burst_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at >= one_minute_ago;

  IF burst_count >= p_burst_limit THEN
    RETURN -1;
  END IF;

  IF NOT p_used_default_key THEN
    INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
    VALUES (p_user_id, p_action_type, false, p_model_id, p_provider);
    RETURN 0;
  END IF;

  PERFORM 1 FROM api_usage
  WHERE user_id = p_user_id
    AND used_default_key = true
    AND created_at >= week_start
  FOR UPDATE;

  SELECT COUNT(*) INTO current_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND used_default_key = true
    AND created_at >= week_start;

  IF current_count >= p_weekly_limit THEN
    RETURN p_weekly_limit + 1;
  END IF;

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, p_action_type, true, p_model_id, p_provider);

  RETURN current_count + 1;
END;
$$;

-- Style signatures are a non-billable background feature (auto-refreshed on finalize).
-- When the app key is used, cap daily LLM calls to prevent abuse without charging credits.
CREATE OR REPLACE FUNCTION try_record_style_signature_app_call(
  p_user_id UUID,
  p_daily_limit INT DEFAULT 12
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN FALSE;
  END IF;

  v_day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT COUNT(*) INTO v_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND action_type = 'style_signature_llm'
    AND created_at >= v_day_start;

  IF v_count >= p_daily_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, 'style_signature_llm', true, 'gpt-4o-mini', 'openai');

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION grant_credits(UUID, INT, credit_transaction_type, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_credits(UUID, INT, credit_transaction_type, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION try_record_style_signature_app_call(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_record_style_signature_app_call(UUID, INT) TO authenticated, service_role;
