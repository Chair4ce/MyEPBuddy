-- Retracting a pending supervise request should also clear the standing
-- managed-account consent prompt so the invitee cannot accept after retract.

CREATE OR REPLACE FUNCTION public.retract_pending_team_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_request public.team_requests%ROWTYPE;
  v_supervisor_id uuid;
  v_subordinate_id uuid;
  v_links_cleared integer := 0;
  v_tokens_invalidated integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.team_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.requester_id <> v_me THEN
    RAISE EXCEPTION 'Not authorized to retract this request' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN json_build_object(
      'success', true,
      'status', v_request.status,
      'message', 'Request is no longer pending'
    );
  END IF;

  IF v_request.request_type = 'supervise' THEN
    v_supervisor_id := v_request.requester_id;
    v_subordinate_id := v_request.target_id;
  ELSE
    v_supervisor_id := v_request.target_id;
    v_subordinate_id := v_request.requester_id;
  END IF;

  -- Clear open managed-link consent for this supervision pair.
  WITH cleared AS (
    UPDATE public.pending_managed_links pml
    SET
      status = 'rejected',
      responded_at = now(),
      supervisor_accepted = false
    FROM public.team_members tm
    WHERE pml.team_member_id = tm.id
      AND pml.user_id = v_subordinate_id
      AND tm.supervisor_id = v_supervisor_id
      AND pml.status = 'pending'
    RETURNING pml.team_member_id
  )
  SELECT COUNT(*)::integer INTO v_links_cleared FROM cleared;

  -- Invalidate unused invite tokens for matching team members owned by me.
  WITH invalidated AS (
    UPDATE public.managed_member_invite_tokens t
    SET consumed_at = now()
    FROM public.team_members tm
    WHERE t.team_member_id = tm.id
      AND tm.supervisor_id = v_me
      AND tm.linked_user_id IS NULL
      AND lower(trim(COALESCE(tm.email, ''))) = (
        SELECT lower(trim(COALESCE(p.email, '')))
        FROM public.profiles p
        WHERE p.id = v_request.target_id
      )
      AND t.consumed_at IS NULL
    RETURNING t.id
  )
  SELECT COUNT(*)::integer INTO v_tokens_invalidated FROM invalidated;

  DELETE FROM public.team_requests WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'status', 'retracted',
    'managed_links_cleared', v_links_cleared,
    'invite_tokens_invalidated', v_tokens_invalidated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retract_pending_team_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retract_pending_team_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
