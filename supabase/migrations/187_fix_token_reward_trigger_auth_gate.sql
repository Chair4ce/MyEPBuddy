-- Allow grant_token_reward from AFTER INSERT triggers (auth.uid() set)
-- while still blocking direct authenticated RPC (pg_trigger_depth() = 0).

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
  -- Block direct authenticated RPC; allow service_role (auth.uid() NULL)
  -- and nested trigger calls (pg_trigger_depth() > 0).
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0 THEN
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

REVOKE ALL ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) TO service_role;
