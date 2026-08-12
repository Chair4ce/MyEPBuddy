-- Global token-bucket bandwidth for the shared default LLM key.
-- Replaces the rigid per-user 5/60s burst on consume_credit with:
--   1) App-wide RPM pool (epb_config.default_key_rpm)
--   2) Fair share when multiple users are active in the last 60s
-- Alone users get the full pool; contended users split it evenly.
-- BYOK (check_and_record_usage) keeps the existing 5/60s per-user burst.

ALTER TABLE epb_config
  ADD COLUMN IF NOT EXISTS default_key_rpm INT NOT NULL DEFAULT 60
  CHECK (default_key_rpm >= 5 AND default_key_rpm <= 2000);

COMMENT ON COLUMN epb_config.default_key_rpm IS
  'Shared default-key requests per minute (global token bucket). Alone users get the full budget; concurrent users share fairly.';

CREATE TABLE IF NOT EXISTS default_key_bandwidth (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tokens DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE default_key_bandwidth IS
  'Singleton token bucket for shared default LLM key traffic across all users.';

INSERT INTO default_key_bandwidth (id, tokens, updated_at)
VALUES (1, 60, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE default_key_bandwidth ENABLE ROW LEVEL SECURITY;
-- No policies: authenticated/anon cannot touch the row; SECURITY DEFINER RPCs bypass RLS.

REVOKE ALL ON TABLE default_key_bandwidth FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE default_key_bandwidth TO service_role;

-- ---------------------------------------------------------------------------
-- consume_credit: global bandwidth + fair share (no fixed per-user 5/60)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION consume_credit(
  p_user_id UUID,
  p_action_type TEXT,
  p_model_id TEXT,
  p_provider TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_one_minute_ago TIMESTAMPTZ;
  v_balance INT;
  v_new_balance INT;
  v_transaction_id UUID;
  v_existing_consume_id UUID;
  v_capacity INT;
  v_other_active INT;
  v_active INT;
  v_user_recent INT;
  v_fair_cap INT;
  v_tokens DOUBLE PRECISION;
  v_bucket_updated TIMESTAMPTZ;
  v_elapsed_ms DOUBLE PRECISION;
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

  -- Global default-key bandwidth (token bucket + fair share)
  SELECT COALESCE(default_key_rpm, 60)
  INTO v_capacity
  FROM epb_config
  WHERE id = 1;

  IF v_capacity IS NULL OR v_capacity < 5 THEN
    v_capacity := 60;
  END IF;

  v_one_minute_ago := now() - INTERVAL '60 seconds';

  SELECT COUNT(DISTINCT user_id)
  INTO v_other_active
  FROM api_usage
  WHERE used_default_key = true
    AND created_at >= v_one_minute_ago
    AND user_id <> p_user_id
    AND action_type <> 'style_signature_llm';

  v_active := COALESCE(v_other_active, 0) + 1;

  SELECT COUNT(*)
  INTO v_user_recent
  FROM api_usage
  WHERE user_id = p_user_id
    AND used_default_key = true
    AND created_at >= v_one_minute_ago
    AND action_type <> 'style_signature_llm';

  v_fair_cap := GREATEST(1, CEIL(v_capacity::numeric / v_active)::INT);

  -- When multiple users contend, cap each to an even share of the pool.
  IF v_active > 1 AND COALESCE(v_user_recent, 0) >= v_fair_cap THEN
    RETURN -1;
  END IF;

  SELECT tokens, updated_at
  INTO v_tokens, v_bucket_updated
  FROM default_key_bandwidth
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO default_key_bandwidth (id, tokens, updated_at)
    VALUES (1, v_capacity, now())
    ON CONFLICT (id) DO NOTHING;

    SELECT tokens, updated_at
    INTO v_tokens, v_bucket_updated
    FROM default_key_bandwidth
    WHERE id = 1
    FOR UPDATE;
  END IF;

  v_elapsed_ms := EXTRACT(EPOCH FROM (now() - v_bucket_updated)) * 1000.0;
  IF v_elapsed_ms < 0 THEN
    v_elapsed_ms := 0;
  END IF;

  v_tokens := LEAST(
    v_capacity::DOUBLE PRECISION,
    COALESCE(v_tokens, 0) + (v_elapsed_ms / 60000.0) * v_capacity
  );

  IF v_tokens < 1 THEN
    RETURN -1;
  END IF;

  UPDATE default_key_bandwidth
  SET
    tokens = v_tokens - 1,
    updated_at = now()
  WHERE id = 1;

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
      -- Refund credit; bandwidth slot stays consumed (acceptable under contention).
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

REVOKE ALL ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
