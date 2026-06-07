-- CRITICAL FIX: migration 166 capped trial balances with a direct UPDATE on
-- user_credits (balance = LEAST(balance, 20)) WITHOUT writing a ledger event.
-- The chain-validation trigger added in 170 therefore rejects the next
-- consume_credit for every capped user (expects the old ledger balance_after,
-- not the capped balance), freezing those accounts.
--
-- Record the historical cap as an explicit, auditable 'adjustment' event so the
-- ledger's latest balance_after matches user_credits.balance and the chain is
-- valid again. Idempotent: only realigns users whose chain is currently broken.

INSERT INTO credit_transactions (
  user_id,
  type,
  amount,
  balance_after,
  description
)
SELECT
  uc.user_id,
  'adjustment'::credit_transaction_type,
  uc.balance - COALESCE(lb.balance_after, 0),
  uc.balance,
  'Ledger realignment: signup trial cap (migration 166) recorded as adjustment event'
FROM user_credits uc
LEFT JOIN LATERAL (
  SELECT balance_after
  FROM credit_transactions ct
  WHERE ct.user_id = uc.user_id
  ORDER BY ct.created_at DESC, ct.id DESC
  LIMIT 1
) lb ON true
WHERE uc.balance <> COALESCE(lb.balance_after, 0);
