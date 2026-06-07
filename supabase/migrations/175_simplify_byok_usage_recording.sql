-- Cleanup: check_and_record_usage is only ever called for BYOK (own-key) users.
-- Default-key users go through consume_credit, so the function's default-key
-- weekly-limit branch and p_weekly_limit / p_used_default_key params were dead
-- code executing nothing on the BYOK path. Replace with a lean BYOK recorder:
-- burst guard + usage insert. Behaviour for callers is unchanged (returns -1 on
-- burst, else 0).

DROP FUNCTION IF EXISTS check_and_record_usage(UUID, TEXT, BOOLEAN, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION check_and_record_usage(
  p_user_id UUID,
  p_action_type TEXT,
  p_model_id TEXT,
  p_provider TEXT,
  p_burst_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burst_count INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COUNT(*) INTO v_burst_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at >= now() - INTERVAL '60 seconds';

  IF v_burst_count >= p_burst_limit THEN
    RETURN -1;
  END IF;

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, p_action_type, false, p_model_id, p_provider);

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION check_and_record_usage(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_and_record_usage(UUID, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;
