-- One standing pending team_request per (requester, target).
-- Sync managed-link "Accept Supervisor" with team_requests so invitees
-- are not asked twice for the same supervision consent.

-- ---------------------------------------------------------------------------
-- 1. Deduplicate any existing duplicate pending rows (keep oldest)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY requester_id, target_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.team_requests
  WHERE status = 'pending'
)
DELETE FROM public.team_requests t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Replace UNIQUE(requester, target, status) with partial unique on pending
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_requests
  DROP CONSTRAINT IF EXISTS team_requests_requester_id_target_id_status_key;

DROP INDEX IF EXISTS public.team_requests_one_pending_pair;

CREATE UNIQUE INDEX team_requests_one_pending_pair
  ON public.team_requests (requester_id, target_id)
  WHERE status = 'pending';

COMMENT ON INDEX public.team_requests_one_pending_pair IS
  'At most one standing pending supervision request per requester→target pair.';

-- ---------------------------------------------------------------------------
-- 3. Ensure (create-or-return) a pending request
-- ---------------------------------------------------------------------------
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
    RAISE EXCEPTION 'Invalid target' USING ERRCODE = '22023';
  END IF;

  IF p_request_type IS DISTINCT FROM 'supervise'
     AND p_request_type IS DISTINCT FROM 'be_supervised' THEN
    RAISE EXCEPTION 'Invalid request_type' USING ERRCODE = '22023';
  END IF;

  -- Already pending?
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

  -- Already linked in that direction — no new request needed.
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
  'Create a pending team_request or return the existing pending one (never duplicates).';

REVOKE ALL ON FUNCTION public.ensure_pending_team_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_pending_team_request(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retract (delete) a pending request — requester only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retract_pending_team_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_request public.team_requests%ROWTYPE;
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

  DELETE FROM public.team_requests WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'status', 'retracted');
END;
$$;

REVOKE ALL ON FUNCTION public.retract_pending_team_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retract_pending_team_request(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Accept supervisor from managed link → also accept matching team_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_supervisor_from_link(link_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_team_member_id uuid;
  v_supervisor_id uuid;
  v_supervisor_name text;
  v_request_id uuid;
BEGIN
  SELECT pml.user_id, pml.team_member_id, tm.supervisor_id
  INTO v_user_id, v_team_member_id, v_supervisor_id
  FROM public.pending_managed_links pml
  JOIN public.team_members tm ON pml.team_member_id = tm.id
  WHERE pml.id = link_id AND pml.user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Link not found or not authorized';
  END IF;

  IF (SELECT supervisor_accepted FROM public.pending_managed_links WHERE id = link_id) THEN
    RETURN json_build_object('success', true, 'message', 'Supervisor already accepted');
  END IF;

  SELECT full_name INTO v_supervisor_name
  FROM public.profiles
  WHERE id = v_supervisor_id;

  -- Accept (or create accepted) supervise request so consent is recorded.
  SELECT id INTO v_request_id
  FROM public.team_requests
  WHERE requester_id = v_supervisor_id
    AND target_id = v_user_id
    AND request_type = 'supervise'
    AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_request_id IS NOT NULL THEN
    UPDATE public.team_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = v_request_id;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.team_requests
    WHERE requester_id = v_supervisor_id
      AND target_id = v_user_id
      AND request_type = 'supervise'
      AND status = 'accepted'
  ) THEN
    INSERT INTO public.team_requests (
      requester_id, target_id, request_type, status, responded_at, message
    )
    VALUES (
      v_supervisor_id,
      v_user_id,
      'supervise',
      'accepted',
      now(),
      'Accepted via managed account link'
    );
  END IF;

  INSERT INTO public.teams (supervisor_id, subordinate_id)
  VALUES (v_supervisor_id, v_user_id)
  ON CONFLICT (supervisor_id, subordinate_id) DO NOTHING;

  UPDATE public.pending_managed_links
  SET supervisor_accepted = true
  WHERE id = link_id;

  RETURN json_build_object(
    'success', true,
    'supervisor_id', v_supervisor_id,
    'supervisor_name', v_supervisor_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_supervisor_from_link(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. respond_to_team_request → mark matching pending_managed_links accepted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_team_request(
  p_request_id uuid,
  p_accept boolean
)
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

  IF v_request.target_id <> v_me THEN
    RAISE EXCEPTION 'Not authorized to respond to this request' USING ERRCODE = '42501';
  END IF;

  IF v_request.status = 'declined' THEN
    RETURN json_build_object('success', true, 'status', 'declined');
  END IF;

  IF NOT p_accept THEN
    UPDATE public.team_requests
    SET status = 'declined', responded_at = now()
    WHERE id = p_request_id;

    RETURN json_build_object('success', true, 'status', 'declined');
  END IF;

  IF v_request.request_type = 'supervise' THEN
    v_supervisor_id := v_request.requester_id;
    v_subordinate_id := v_request.target_id;
  ELSE
    v_supervisor_id := v_request.target_id;
    v_subordinate_id := v_request.requester_id;
  END IF;

  IF v_request.status <> 'accepted' THEN
    UPDATE public.team_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
  END IF;

  INSERT INTO public.teams (supervisor_id, subordinate_id)
  VALUES (v_supervisor_id, v_subordinate_id)
  ON CONFLICT (supervisor_id, subordinate_id) DO NOTHING;

  -- Keep managed-link UI in sync when consent happens via Team page.
  UPDATE public.pending_managed_links pml
  SET supervisor_accepted = true
  FROM public.team_members tm
  WHERE pml.team_member_id = tm.id
    AND pml.user_id = v_subordinate_id
    AND tm.supervisor_id = v_supervisor_id
    AND pml.status = 'pending'
    AND pml.supervisor_accepted = false;

  RETURN json_build_object(
    'success', true,
    'status', 'accepted',
    'supervisor_id', v_supervisor_id,
    'subordinate_id', v_subordinate_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_team_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_team_request(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
