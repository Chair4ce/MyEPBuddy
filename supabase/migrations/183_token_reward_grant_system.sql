-- Central token reward grant system: config-driven, idempotent, extensible.
-- Add new rewards by: enum value (separate migration) + config row + eligibility branch + trigger/API call.

CREATE TYPE token_reward_repeat_mode AS ENUM (
  'once_per_user',
  'once_per_source',
  'repeatable_per_cycle'
);

CREATE TABLE token_reward_config (
  reward_key credit_reward_type PRIMARY KEY,
  amount INT NOT NULL CHECK (amount > 0),
  repeat_mode token_reward_repeat_mode NOT NULL,
  cap_per_cycle INT CHECK (cap_per_cycle IS NULL OR cap_per_cycle > 0),
  requires_phone_verified BOOLEAN NOT NULL DEFAULT false,
  skip_if_byok BOOLEAN NOT NULL DEFAULT true,
  max_bonus_per_cycle INT NOT NULL DEFAULT 200,
  public_label TEXT NOT NULL,
  rule_summary TEXT NOT NULL,
  rule_steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  sort_order INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  visible_in_tracker BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_token_reward_config_updated_at
  BEFORE UPDATE ON token_reward_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE token_reward_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read token reward config"
  ON token_reward_config FOR SELECT
  TO authenticated
  USING (visible_in_tracker = true OR enabled = true);

INSERT INTO token_reward_config (
  reward_key,
  amount,
  repeat_mode,
  cap_per_cycle,
  requires_phone_verified,
  skip_if_byok,
  public_label,
  rule_summary,
  rule_steps,
  sort_order,
  enabled,
  visible_in_tracker
) VALUES
  (
    'first_managed_member',
    10,
    'once_per_user',
    NULL,
    false,
    true,
    'First managed team member',
    'One-time bonus when you add your first managed team member to your roster.',
    '["Add a managed team member from My Team (name + optional email).", "Tokens are granted once per account — not for each additional member.", "Creating placeholders after the first does not earn again."]'::JSONB,
    10,
    true,
    true
  ),
  (
    'referral_referrer',
    15,
    'repeatable_per_cycle',
    10,
    true,
    true,
    'Refer a teammate',
    'Earn when someone signs up on your referral link, verifies a unique phone, and uses AI.',
    '["Share your referral link.", "They verify email and a unique phone number.", "After a short delay and their first AI action, you both earn tokens (up to 10 referrals per year)."]'::JSONB,
    20,
    false,
    true
  ),
  (
    'referral_referee',
    10,
    'once_per_source',
    NULL,
    true,
    true,
    'Referral welcome bonus',
    'Welcome tokens when you join via a referral link and verify a unique phone.',
    '["Sign up using a teammate''s referral link.", "Verify email and a unique phone number.", "Complete your first AI action to unlock the welcome bonus."]'::JSONB,
    21,
    false,
    true
  ),
  (
    'supervision_requester',
    8,
    'repeatable_per_cycle',
    15,
    true,
    true,
    'Supervision request accepted',
    'Earn when a supervise / be-supervised request is accepted with a new real partner.',
    '["Send or accept a supervision request with another real account.", "Both verify unique phone numbers and complete an AI action.", "Earn per new partner (shared cap with accepter bonuses)."]'::JSONB,
    30,
    false,
    true
  ),
  (
    'supervision_accepter',
    8,
    'repeatable_per_cycle',
    15,
    true,
    true,
    'Supervision request accepted',
    'Earn when you accept a supervise / be-supervised request from a new real partner.',
    '["Accept a supervision request from a real account.", "Both verify unique phone numbers and complete an AI action.", "Earn per new partner (shared cap with requester bonuses)."]'::JSONB,
    31,
    false,
    true
  );

CREATE OR REPLACE FUNCTION user_uses_own_api_key(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_api_keys k
    WHERE k.user_id = p_user_id
      AND (
        k.openai_key IS NOT NULL
        OR k.anthropic_key IS NOT NULL
        OR k.google_key IS NOT NULL
        OR k.grok_key IS NOT NULL
      )
  );
$$;

CREATE OR REPLACE FUNCTION user_phone_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT u.phone_confirmed_at IS NOT NULL
    FROM auth.users u
    WHERE u.id = p_user_id
  ), false);
$$;

-- Action-specific gates. Extend with new WHEN branches as rewards are wired up.
CREATE OR REPLACE FUNCTION validate_token_reward_context(
  p_user_id UUID,
  p_reward_type credit_reward_type,
  p_source_id TEXT,
  p_context JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count INT;
BEGIN
  CASE p_reward_type
    WHEN 'first_managed_member' THEN
      SELECT COUNT(*)::INT
      INTO v_member_count
      FROM team_members tm
      WHERE tm.supervisor_id = p_user_id;

      RETURN v_member_count >= 1;

    WHEN 'referral_referrer', 'referral_referee', 'supervision_requester', 'supervision_accepter' THEN
      -- Not wired yet — enable in token_reward_config when event handlers land.
      RETURN false;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- Central grant entry point. Server/trigger context only (auth.uid() IS NULL).
-- Returns tokens granted (0 = skipped).
CREATE OR REPLACE FUNCTION grant_token_reward(
  p_user_id UUID,
  p_reward_type credit_reward_type,
  p_source_id TEXT,
  p_context JSONB DEFAULT '{}'::JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config token_reward_config%ROWTYPE;
  v_cycle_year INT := EXTRACT(YEAR FROM now())::INT;
  v_cycle_earned INT;
  v_type_count_cycle INT;
  v_grant_description TEXT;
  v_public_description TEXT;
  v_new_balance INT;
  v_tx_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: token rewards are server-initiated only';
  END IF;

  IF p_user_id IS NULL OR p_source_id IS NULL OR length(trim(p_source_id)) = 0 THEN
    RETURN 0;
  END IF;

  SELECT *
  INTO v_config
  FROM token_reward_config c
  WHERE c.reward_key = p_reward_type;

  IF NOT FOUND OR NOT v_config.enabled THEN
    RETURN 0;
  END IF;

  IF v_config.skip_if_byok AND user_uses_own_api_key(p_user_id) THEN
    RETURN 0;
  END IF;

  IF v_config.requires_phone_verified AND NOT user_phone_verified(p_user_id) THEN
    RETURN 0;
  END IF;

  IF NOT validate_token_reward_context(p_user_id, p_reward_type, p_source_id, p_context) THEN
    RETURN 0;
  END IF;

  -- Global idempotency on (reward_type, source_id).
  IF EXISTS (
    SELECT 1
    FROM credit_rewards cr
    WHERE cr.reward_type = p_reward_type
      AND cr.source_id = p_source_id
  ) THEN
    RETURN 0;
  END IF;

  IF v_config.repeat_mode = 'once_per_user' THEN
    IF p_source_id <> p_user_id::TEXT THEN
      RETURN 0;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM credit_rewards cr
      WHERE cr.user_id = p_user_id
        AND cr.reward_type = p_reward_type
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  IF v_config.repeat_mode = 'repeatable_per_cycle' AND v_config.cap_per_cycle IS NOT NULL THEN
    SELECT COUNT(*)::INT
    INTO v_type_count_cycle
    FROM credit_rewards cr
    WHERE cr.user_id = p_user_id
      AND cr.reward_type = p_reward_type
      AND cr.cycle_year = v_cycle_year;

    IF v_type_count_cycle >= v_config.cap_per_cycle THEN
      RETURN 0;
    END IF;
  END IF;

  SELECT COALESCE(SUM(cr.amount), 0)::INT
  INTO v_cycle_earned
  FROM credit_rewards cr
  WHERE cr.user_id = p_user_id
    AND cr.cycle_year = v_cycle_year;

  IF v_cycle_earned + v_config.amount > v_config.max_bonus_per_cycle THEN
    RETURN 0;
  END IF;

  v_grant_description := format(
    'Earn bonus — %s — %s',
    p_reward_type::TEXT,
    p_source_id
  );
  v_public_description := v_config.public_label;

  v_new_balance := grant_credits(
    p_user_id,
    v_config.amount,
    'bonus',
    NULL,
    v_grant_description
  );

  SELECT ct.id
  INTO v_tx_id
  FROM credit_transactions ct
  WHERE ct.user_id = p_user_id
    AND ct.type = 'bonus'
    AND ct.description = v_grant_description
  ORDER BY ct.created_at DESC
  LIMIT 1;

  INSERT INTO credit_rewards (
    user_id,
    reward_type,
    amount,
    source_id,
    cycle_year,
    credit_transaction_id,
    description
  )
  VALUES (
    p_user_id,
    p_reward_type,
    v_config.amount,
    p_source_id,
    v_cycle_year,
    v_tx_id,
    v_public_description
  );

  RETURN v_config.amount;
END;
$$;

CREATE OR REPLACE FUNCTION trg_team_members_token_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM grant_token_reward(
    NEW.supervisor_id,
    'first_managed_member',
    NEW.supervisor_id::TEXT,
    jsonb_build_object('team_member_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_first_managed_bonus ON team_members;

CREATE TRIGGER team_members_token_reward
  AFTER INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION trg_team_members_token_reward();

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN json_build_object(
    'cycleYear', v_cycle_year,
    'phoneVerified', user_phone_verified(v_user_id),
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
    'trackerEntries', COALESCE((
      SELECT json_agg(row_to_json(entry) ORDER BY entry.sort_order)
      FROM (
        SELECT
          c.reward_key,
          c.amount,
          c.repeat_mode,
          c.cap_per_cycle,
          c.requires_phone_verified,
          c.public_label,
          c.rule_summary,
          c.rule_steps,
          c.enabled,
          c.sort_order,
          COALESCE((
            SELECT COUNT(*)::INT
            FROM credit_rewards cr
            WHERE cr.user_id = v_user_id
              AND cr.reward_type = c.reward_key
              AND cr.cycle_year = v_cycle_year
          ), 0) AS count_this_cycle,
          EXISTS (
            SELECT 1
            FROM credit_rewards cr
            WHERE cr.user_id = v_user_id
              AND cr.reward_type = c.reward_key
          ) AS claimed_ever
        FROM token_reward_config c
        WHERE c.visible_in_tracker = true
      ) entry
    ), '[]'::JSON),
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

REVOKE ALL ON FUNCTION user_uses_own_api_key(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_uses_own_api_key(UUID) TO service_role;

REVOKE ALL ON FUNCTION user_phone_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_phone_verified(UUID) TO service_role;

REVOKE ALL ON FUNCTION validate_token_reward_context(UUID, credit_reward_type, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_token_reward_context(UUID, credit_reward_type, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION get_user_earn_rewards_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_earn_rewards_summary() TO authenticated;

COMMENT ON TABLE token_reward_config IS
  'Catalog of earn-token actions. Add rows + enum values + eligibility branch + event hook to extend.';
COMMENT ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) IS
  'Central idempotent promotional token grant. Callable only without a user JWT (triggers, service role).';
COMMENT ON FUNCTION validate_token_reward_context(UUID, credit_reward_type, TEXT, JSONB) IS
  'Per-action eligibility beyond config (extend CASE when adding new reward types).';
