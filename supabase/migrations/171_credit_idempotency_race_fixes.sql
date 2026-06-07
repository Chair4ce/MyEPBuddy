-- Fix credit idempotency/refund race conditions:
-- 1. Concurrent duplicate idempotency keys → unique_violation handled safely
-- 2. Idempotent replay returns live user_credits.balance (not stale ledger row)
-- 3. After refund, idempotency key is freed so retries can re-consume

CREATE OR REPLACE FUNCTION consume_credit(
  p_user_id UUID,
  p_action_type TEXT,
  p_model_id TEXT,
  p_provider TEXT,
  p_burst_limit INT DEFAULT 5,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_transaction_id UUID;
  v_existing_consume_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT ct.id
    INTO v_existing_consume_id
    FROM credit_transactions ct
    WHERE ct.user_id = p_user_id
      AND ct.idempotency_key = p_idempotency_key
      AND ct.type = 'consume'
    LIMIT 1;

    IF FOUND AND NOT EXISTS (
      SELECT 1
      FROM credit_transactions rt
      WHERE rt.related_transaction_id = v_existing_consume_id
        AND rt.type = 'refund'
    ) THEN
      SELECT balance INTO v_balance
      FROM user_credits
      WHERE user_id = p_user_id;

      RETURN COALESCE(v_balance, 0);
    END IF;
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

  BEGIN
    INSERT INTO credit_transactions (
      user_id,
      type,
      amount,
      balance_after,
      action_type,
      model_id,
      idempotency_key
    ) VALUES (
      p_user_id,
      'consume',
      -1,
      v_new_balance,
      p_action_type,
      p_model_id,
      p_idempotency_key
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO api_usage (
      user_id,
      action_type,
      used_default_key,
      model_id,
      provider,
      credit_transaction_id
    ) VALUES (
      p_user_id,
      p_action_type,
      true,
      p_model_id,
      p_provider,
      v_transaction_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Another request won the race for this idempotency key; undo our debit.
      UPDATE user_credits SET
        balance = balance + 1,
        lifetime_consumed = GREATEST(0, lifetime_consumed - 1),
        updated_at = now()
      WHERE user_id = p_user_id;

      SELECT balance INTO v_balance
      FROM user_credits
      WHERE user_id = p_user_id;

      RETURN COALESCE(v_balance, 0);
  END;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION refund_credit(
  p_user_id UUID,
  p_idempotency_key TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consume_id UUID;
  v_consume_action TEXT;
  v_balance INT;
  v_new_balance INT;
  v_refund_key TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;

  SELECT id, action_type
  INTO v_consume_id, v_consume_action
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key
    AND type = 'consume'
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE related_transaction_id = v_consume_id
      AND type = 'refund'
  ) THEN
    SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  v_refund_key := 'refund:' || p_idempotency_key;

  SELECT balance INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance, lifetime_consumed)
    VALUES (p_user_id, 1, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + 1,
      updated_at = now()
    RETURNING balance INTO v_new_balance;
  ELSE
    v_new_balance := v_balance + 1;

    UPDATE user_credits SET
      balance = v_new_balance,
      lifetime_consumed = GREATEST(0, lifetime_consumed - 1),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    action_type,
    description,
    related_transaction_id,
    idempotency_key
  ) VALUES (
    p_user_id,
    'refund',
    1,
    v_new_balance,
    v_consume_action,
    COALESCE(p_reason, 'AI request failed — credit refunded'),
    v_consume_id,
    v_refund_key
  );

  -- Free the idempotency key so a retried request can consume again after refund.
  UPDATE credit_transactions
  SET idempotency_key = NULL
  WHERE id = v_consume_id;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION refund_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, TEXT, TEXT) TO authenticated, service_role;
