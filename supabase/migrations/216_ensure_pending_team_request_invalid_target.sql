-- Self/null targets are expected client mistakes (e.g. adding yourself as a
-- managed member). Return JSON instead of RAISE so PostgREST does not log 22023.

CREATE OR REPLACE FUNCTION public.ensure_pending_team_request(
  p_target_id uuid,
  p_request_type text DEFAULT 'supervise',
  p_message text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_existing public.team_requests%ROWTYPE;
  v_supervisor_id uuid;
  v_subordinate_id uuid;
  v_new_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_me THEN
    RETURN json_build_object(
      'success', false,
      'status', 'invalid_target',
      'error', 'You cannot send a team request to yourself'
    );
  END IF;

  IF p_request_type IS DISTINCT FROM 'supervise'
     AND p_request_type IS DISTINCT FROM 'be_supervised' THEN
    RAISE EXCEPTION 'Invalid request_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.team_requests
  WHERE requester_id = v_me
    AND target_id = p_target_id
    AND status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'status', 'already_pending',
      'request_id', v_existing.id,
      'request_type', v_existing.request_type,
      'created_at', v_existing.created_at
    );
  END IF;

  IF p_request_type = 'supervise' THEN
    v_supervisor_id := v_me;
    v_subordinate_id := p_target_id;
  ELSE
    v_supervisor_id := p_target_id;
    v_subordinate_id := v_me;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.supervisor_id = v_supervisor_id
      AND t.subordinate_id = v_subordinate_id
  ) THEN
    RETURN json_build_object(
      'success', true,
      'status', 'already_linked',
      'supervisor_id', v_supervisor_id,
      'subordinate_id', v_subordinate_id
    );
  END IF;

  INSERT INTO public.team_requests (
    requester_id,
    target_id,
    request_type,
    message,
    status
  )
  VALUES (
    v_me,
    p_target_id,
    p_request_type,
    NULLIF(trim(COALESCE(p_message, '')), ''),
    'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object(
    'success', true,
    'status', 'created',
    'request_id', v_new_id,
    'request_type', p_request_type
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.team_requests
    WHERE requester_id = v_me
      AND target_id = p_target_id
      AND status = 'pending'
    LIMIT 1;

    RETURN json_build_object(
      'success', true,
      'status', 'already_pending',
      'request_id', v_existing.id,
      'request_type', v_existing.request_type,
      'created_at', v_existing.created_at
    );
END;
$$;

COMMENT ON FUNCTION public.ensure_pending_team_request(uuid, text, text) IS
  'Create a pending team_request or return the existing pending one (never duplicates). Self/null target returns status=invalid_target.';

REVOKE ALL ON FUNCTION public.ensure_pending_team_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_pending_team_request(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
