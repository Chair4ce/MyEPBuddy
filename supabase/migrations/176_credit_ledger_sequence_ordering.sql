-- Deterministic ledger ordering + index-only chain reads.
--
-- "Latest row" was ORDER BY created_at DESC, id DESC, but id is a random UUID,
-- so rows sharing a created_at tie ordered non-deterministically. Add a
-- monotonic BIGINT `seq` (assigned before BEFORE-INSERT triggers fire) and use
-- it everywhere we need chronological order. Add a covering index so the chain
-- trigger and reconciliation reads are index-only.

ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS seq BIGINT;

-- Backfill existing rows in chronological order.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM credit_transactions
)
UPDATE credit_transactions ct
SET seq = o.rn
FROM ordered o
WHERE ct.id = o.id
  AND ct.seq IS NULL;

CREATE SEQUENCE IF NOT EXISTS credit_transactions_seq OWNED BY credit_transactions.seq;
SELECT setval(
  'credit_transactions_seq',
  COALESCE((SELECT max(seq) FROM credit_transactions), 0) + 1,
  false
);

ALTER TABLE credit_transactions ALTER COLUMN seq SET DEFAULT nextval('credit_transactions_seq');
ALTER TABLE credit_transactions ALTER COLUMN seq SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_seq
  ON credit_transactions (seq);

-- Covering index: chain trigger + reconcile read the latest balance_after per
-- user without touching the heap.
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_seq
  ON credit_transactions (user_id, seq DESC) INCLUDE (balance_after);

-- Chain validation now keys off seq (strictly-prior row, deterministic).
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
    AND seq < NEW.seq
  ORDER BY seq DESC
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

-- reconcile + repair read the authoritative latest balance via seq.
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
    ORDER BY seq DESC
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
      ORDER BY ct.seq DESC
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
  ORDER BY seq DESC
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

-- consume_credit idempotent replay no longer needs created_at ordering; the
-- existing logic is unaffected, but the new index accelerates its lookups.
