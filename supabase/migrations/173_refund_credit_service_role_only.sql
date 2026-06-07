-- SECURITY FIX: refund_credit was callable by `authenticated`, and users can
-- read their own consume idempotency_key via the ledger SELECT policy. That let
-- a user refund a credit they had already successfully spent (free calls).
--
-- Refunds must only ever be initiated server-side (admin/service-role) when the
-- app itself detects a failed billable request. Lock the function down and
-- reject any authenticated caller defensively.

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
  -- Service-role / server context only. End-user JWTs populate auth.uid();
  -- reject them even if a future GRANT is added by mistake.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: refunds are server-initiated only';
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

  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent refund for the same consume already landed; undo our increment.
      UPDATE user_credits SET
        balance = GREATEST(0, balance - 1),
        lifetime_consumed = lifetime_consumed + 1,
        updated_at = now()
      WHERE user_id = p_user_id;

      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
  END;

  -- Free the consume idempotency key so a legitimate retry can re-consume.
  UPDATE credit_transactions
  SET idempotency_key = NULL
  WHERE id = v_consume_id;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION refund_credit(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION refund_credit(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, TEXT, TEXT) TO service_role;
