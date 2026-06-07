-- Event-sourced credit ledger hardening:
-- 1. Idempotent consume (HTTP retry safe)
-- 2. Refund path linked to consume transactions
-- 3. Ledger chain validation + admin reconciliation/repair
-- 4. api_usage linked to ledger; block direct client inserts

DROP FUNCTION IF EXISTS consume_credit(UUID, TEXT, TEXT, TEXT, INT);

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS related_transaction_id UUID REFERENCES credit_transactions(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_user_idempotency
  ON credit_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND type = 'consume';

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_refund_related
  ON credit_transactions (related_transaction_id)
  WHERE type = 'refund' AND related_transaction_id IS NOT NULL;

ALTER TABLE api_usage
  ADD COLUMN IF NOT EXISTS credit_transaction_id UUID REFERENCES credit_transactions(id);

CREATE INDEX IF NOT EXISTS idx_api_usage_credit_transaction
  ON api_usage (credit_transaction_id)
  WHERE credit_transaction_id IS NOT NULL;

-- Direct client inserts enabled burst-limit griefing; RPCs use SECURITY DEFINER.
DROP POLICY IF EXISTS "Service role can insert usage" ON api_usage;

CREATE OR REPLACE FUNCTION validate_credit_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prev_balance INT;
BEGIN
  SELECT balance_after INTO v_prev_balance
  FROM credit_transactions
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  v_prev_balance := COALESCE(v_prev_balance, 0);

  IF NEW.balance_after <> v_prev_balance + NEW.amount THEN
    RAISE EXCEPTION
      'credit ledger chain mismatch for user %: expected balance_after %, got %',
      NEW.user_id,
      v_prev_balance + NEW.amount,
      NEW.balance_after;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_credit_ledger_entry ON credit_transactions;
CREATE TRIGGER trg_validate_credit_ledger_entry
  BEFORE INSERT ON credit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_credit_ledger_entry();

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
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_new_balance
    FROM credit_transactions
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
      AND type = 'consume'
    LIMIT 1;

    IF FOUND THEN
      RETURN v_new_balance;
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

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_user_credits(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_balance INT;
  v_stored_balance INT;
  v_ledger_consumed INT;
  v_stored_consumed INT;
  v_ledger_purchased INT;
  v_stored_purchased INT;
  v_mismatched_users JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT balance_after INTO v_ledger_balance
    FROM credit_transactions
    WHERE user_id = p_user_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    v_ledger_balance := COALESCE(v_ledger_balance, 0);

    SELECT COALESCE(SUM(
      CASE
        WHEN type = 'consume' THEN 1
        WHEN type = 'refund' THEN -1
        ELSE 0
      END
    ), 0)::INT
    INTO v_ledger_consumed
    FROM credit_transactions
    WHERE user_id = p_user_id;

    SELECT COALESCE(SUM(amount), 0)::INT
    INTO v_ledger_purchased
    FROM credit_transactions
    WHERE user_id = p_user_id
      AND type = 'purchase';

    SELECT balance, lifetime_consumed, lifetime_purchased
    INTO v_stored_balance, v_stored_consumed, v_stored_purchased
    FROM user_credits
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'ledger_balance', v_ledger_balance,
      'stored_balance', COALESCE(v_stored_balance, 0),
      'ledger_consumed', v_ledger_consumed,
      'stored_consumed', COALESCE(v_stored_consumed, 0),
      'ledger_purchased', v_ledger_purchased,
      'stored_purchased', COALESCE(v_stored_purchased, 0),
      'is_consistent',
        v_ledger_balance = COALESCE(v_stored_balance, 0)
        AND v_ledger_consumed = COALESCE(v_stored_consumed, 0)
        AND v_ledger_purchased = COALESCE(v_stored_purchased, 0)
    );
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb), '[]'::jsonb)
  INTO v_mismatched_users
  FROM (
    SELECT
      uc.user_id,
      uc.balance AS stored_balance,
      COALESCE(lb.ledger_balance, 0) AS ledger_balance,
      uc.lifetime_consumed AS stored_consumed,
      COALESCE(lc.ledger_consumed, 0) AS ledger_consumed
    FROM user_credits uc
    LEFT JOIN LATERAL (
      SELECT balance_after AS ledger_balance
      FROM credit_transactions ct
      WHERE ct.user_id = uc.user_id
      ORDER BY ct.created_at DESC, ct.id DESC
      LIMIT 1
    ) lb ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN type = 'consume' THEN 1
          WHEN type = 'refund' THEN -1
          ELSE 0
        END
      ), 0)::INT AS ledger_consumed
      FROM credit_transactions ct
      WHERE ct.user_id = uc.user_id
    ) lc ON true
    WHERE uc.balance <> COALESCE(lb.ledger_balance, 0)
       OR uc.lifetime_consumed <> COALESCE(lc.ledger_consumed, 0)
  ) m;

  RETURN jsonb_build_object(
    'mismatch_count', jsonb_array_length(v_mismatched_users),
    'mismatches', v_mismatched_users
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_user_credits_from_ledger(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_balance INT;
  v_ledger_consumed INT;
  v_ledger_purchased INT;
  v_trial_granted BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT balance_after INTO v_ledger_balance
  FROM credit_transactions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  v_ledger_balance := COALESCE(v_ledger_balance, 0);

  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'consume' THEN 1
      WHEN type = 'refund' THEN -1
      ELSE 0
    END
  ), 0)::INT
  INTO v_ledger_consumed
  FROM credit_transactions
  WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(amount), 0)::INT
  INTO v_ledger_purchased
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND type = 'purchase';

  SELECT EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE user_id = p_user_id AND type = 'trial'
  ) INTO v_trial_granted;

  INSERT INTO user_credits (
    user_id,
    balance,
    lifetime_consumed,
    lifetime_purchased,
    trial_granted
  ) VALUES (
    p_user_id,
    v_ledger_balance,
    v_ledger_consumed,
    v_ledger_purchased,
    v_trial_granted
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = EXCLUDED.balance,
    lifetime_consumed = EXCLUDED.lifetime_consumed,
    lifetime_purchased = EXCLUDED.lifetime_purchased,
    trial_granted = user_credits.trial_granted OR EXCLUDED.trial_granted,
    updated_at = now();

  RETURN reconcile_user_credits(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit(UUID, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION refund_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION reconcile_user_credits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_user_credits(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION sync_user_credits_from_ledger(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_user_credits_from_ledger(UUID) TO authenticated, service_role;
