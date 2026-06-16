-- Token earn rewards: ledger for connection bonuses (referrals, supervision).
-- Grants are issued server-side only (future grant_connection_bonus RPC).

ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'bonus';

CREATE TYPE credit_reward_type AS ENUM (
  'referral_referrer',
  'referral_referee',
  'supervision_requester',
  'supervision_accepter'
);

CREATE TABLE credit_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_type credit_reward_type NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  source_id TEXT NOT NULL,
  cycle_year INT NOT NULL,
  credit_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reward_type, source_id)
);

CREATE INDEX idx_credit_rewards_user_cycle
  ON credit_rewards (user_id, cycle_year);

CREATE INDEX idx_credit_rewards_user_created
  ON credit_rewards (user_id, created_at DESC);

-- Durable phone identity for promotion abuse prevention (server-side only).
CREATE TABLE promotion_phone_identities (
  phone_hash TEXT PRIMARY KEY,
  referee_bonus_claimed BOOLEAN NOT NULL DEFAULT false,
  first_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_phone_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit rewards"
  ON credit_rewards FOR SELECT
  USING (user_id = auth.uid());

-- No policies on promotion_phone_identities: service-role / SECURITY DEFINER only.

-- Read-only summary for the earn-tokens tracker UI.
CREATE OR REPLACE FUNCTION get_user_earn_rewards_summary()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cycle_year INT := EXTRACT(YEAR FROM now())::INT;
  v_phone_verified BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT (u.phone_confirmed_at IS NOT NULL)
  INTO v_phone_verified
  FROM auth.users u
  WHERE u.id = v_user_id;

  RETURN json_build_object(
    'cycleYear', v_cycle_year,
    'phoneVerified', COALESCE(v_phone_verified, false),
    'totalBonusEarned', COALESCE((
      SELECT SUM(cr.amount)::INT
      FROM credit_rewards cr
      WHERE cr.user_id = v_user_id
    ), 0),
    'totalBonusEarnedCycle', COALESCE((
      SELECT SUM(cr.amount)::INT
      FROM credit_rewards cr
      WHERE cr.user_id = v_user_id
        AND cr.cycle_year = v_cycle_year
    ), 0),
    'referralCount', COALESCE((
      SELECT COUNT(*)::INT
      FROM credit_rewards cr
      WHERE cr.user_id = v_user_id
        AND cr.cycle_year = v_cycle_year
        AND cr.reward_type = 'referral_referrer'
    ), 0),
    'supervisionCount', COALESCE((
      SELECT COUNT(*)::INT
      FROM credit_rewards cr
      WHERE cr.user_id = v_user_id
        AND cr.cycle_year = v_cycle_year
        AND cr.reward_type IN ('supervision_requester', 'supervision_accepter')
    ), 0),
    'recentRewards', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          cr.id,
          cr.reward_type,
          cr.amount,
          cr.description,
          cr.cycle_year,
          cr.created_at
        FROM credit_rewards cr
        WHERE cr.user_id = v_user_id
        ORDER BY cr.created_at DESC
        LIMIT 10
      ) t
    ), '[]'::JSON)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_user_earn_rewards_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_earn_rewards_summary() TO authenticated;

COMMENT ON TABLE credit_rewards IS
  'Immutable log of promotional token grants. source_id is idempotency key per reward_type.';
COMMENT ON FUNCTION get_user_earn_rewards_summary() IS
  'Returns earn-tracker stats for the authenticated user (referral/supervision counts, totals).';
