-- Atomic usage check-and-insert to prevent race conditions.
--
-- Return codes:
--   0          = own-key user, unlimited, row inserted
--   1..limit   = default-key user, row inserted, value is new weekly total
--   > limit    = weekly limit reached, row NOT inserted
--   -1         = burst rate limit hit (too many actions in 60 s), row NOT inserted

CREATE OR REPLACE FUNCTION check_and_record_usage(
  p_user_id UUID,
  p_action_type TEXT,
  p_used_default_key BOOLEAN,
  p_model_id TEXT,
  p_provider TEXT,
  p_weekly_limit INT DEFAULT 20,
  p_burst_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start TIMESTAMPTZ;
  current_count INT;
  burst_count INT;
  one_minute_ago TIMESTAMPTZ;
BEGIN
  week_start := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  one_minute_ago := now() - INTERVAL '60 seconds';

  -- Burst rate limit applies to ALL users (own-key and default-key)
  SELECT COUNT(*) INTO burst_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at >= one_minute_ago;

  IF burst_count >= p_burst_limit THEN
    RETURN -1;
  END IF;

  IF NOT p_used_default_key THEN
    INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
    VALUES (p_user_id, p_action_type, false, p_model_id, p_provider);
    RETURN 0;
  END IF;

  -- Lock the user's default-key rows for this week to serialize concurrent requests
  PERFORM 1 FROM api_usage
  WHERE user_id = p_user_id
    AND used_default_key = true
    AND created_at >= week_start
  FOR UPDATE;

  SELECT COUNT(*) INTO current_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND used_default_key = true
    AND created_at >= week_start;

  IF current_count >= p_weekly_limit THEN
    -- Return limit + 1 so the caller can distinguish "limit hit" from
    -- "just inserted the Nth action" when current_count == p_weekly_limit
    RETURN p_weekly_limit + 1;
  END IF;

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, p_action_type, true, p_model_id, p_provider);

  RETURN current_count + 1;
END;
$$;
