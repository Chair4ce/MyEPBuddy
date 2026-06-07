-- 1. Burst-window cross-talk: background style-signature LLM calls
--    (action_type = 'style_signature_llm') were counted toward the 5/min
--    consume burst limit, so style-sig activity could rate-limit real billable
--    actions. Exclude them from the burst count (they have their own daily cap).
-- 2. check_and_record_usage retained a PUBLIC/anon EXECUTE grant. The internal
--    auth.uid() guard already blocks anon, but tighten to least privilege.

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
    AND created_at >= v_one_minute_ago
    AND action_type <> 'style_signature_llm';

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

REVOKE ALL ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION check_and_record_usage(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_and_record_usage(UUID, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;
