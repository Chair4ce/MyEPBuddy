-- Prevent teams.teams_check (supervisor_id != subordinate_id) violations
-- when a user accepts a managed-account link they themselves created
-- (same person is supervisor and subordinate).

-- ---------------------------------------------------------------------------
-- 1. accept_supervisor_from_link — fail closed before INSERT INTO teams
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

  IF v_supervisor_id IS NULL OR v_supervisor_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot accept yourself as supervisor'
      USING ERRCODE = '22023';
  END IF;

  IF (SELECT supervisor_accepted FROM public.pending_managed_links WHERE id = link_id) THEN
    RETURN json_build_object('success', true, 'message', 'Supervisor already accepted');
  END IF;

  SELECT full_name INTO v_supervisor_name
  FROM public.profiles
  WHERE id = v_supervisor_id;

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
-- 2. respond_to_team_request — same check before INSERT INTO teams
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

  IF v_supervisor_id = v_subordinate_id THEN
    RAISE EXCEPTION 'Cannot create a team relationship with yourself'
      USING ERRCODE = '22023';
  END IF;

  IF v_request.status <> 'accepted' THEN
    UPDATE public.team_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
  END IF;

  INSERT INTO public.teams (supervisor_id, subordinate_id)
  VALUES (v_supervisor_id, v_subordinate_id)
  ON CONFLICT (supervisor_id, subordinate_id) DO NOTHING;

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

-- ---------------------------------------------------------------------------
-- 3. Do not create pending self-links
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_managed_members_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.pending_managed_links (user_id, team_member_id)
    SELECT NEW.id, tm.id
    FROM public.team_members tm
    WHERE LOWER(tm.email) = LOWER(NEW.email)
      AND tm.linked_user_id IS NULL
      AND tm.is_placeholder = true
      AND tm.supervisor_id IS DISTINCT FROM NEW.id
    ON CONFLICT (user_id, team_member_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pending_link_for_existing_user(
  p_team_member_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team_member record;
  v_existing_link record;
  v_link_id uuid;
BEGIN
  SELECT id, supervisor_id, linked_user_id, email, full_name
  INTO v_team_member
  FROM public.team_members
  WHERE id = p_team_member_id
    AND supervisor_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  IF p_user_id = v_team_member.supervisor_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot link a managed account to its own supervisor'
    );
  END IF;

  IF v_team_member.linked_user_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Team member is already linked to an account'
    );
  END IF;

  SELECT id, status INTO v_existing_link
  FROM public.pending_managed_links
  WHERE team_member_id = p_team_member_id
    AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing_link.status = 'rejected' THEN
      UPDATE public.pending_managed_links
      SET status = 'pending',
          responded_at = NULL,
          data_synced = false,
          supervisor_accepted = false,
          created_at = now()
      WHERE id = v_existing_link.id
      RETURNING id INTO v_link_id;

      RETURN json_build_object(
        'success', true,
        'message', 'Link request reactivated',
        'link_id', v_link_id
      );
    ELSE
      RETURN json_build_object(
        'success', false,
        'message', 'A link request already exists for this user'
      );
    END IF;
  END IF;

  INSERT INTO public.pending_managed_links (user_id, team_member_id)
  VALUES (p_user_id, p_team_member_id)
  RETURNING id INTO v_link_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Link request created',
    'link_id', v_link_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_link_for_existing_user(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_team_member_email_for_existing_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_user_id uuid;
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email AND NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id
    FROM public.profiles
    WHERE email = NEW.email
      AND id != COALESCE(NEW.linked_user_id, '00000000-0000-0000-0000-000000000000')
      AND id IS DISTINCT FROM NEW.supervisor_id;

    IF v_existing_user_id IS NOT NULL THEN
      INSERT INTO public.pending_managed_links (user_id, team_member_id)
      VALUES (v_existing_user_id, NEW.id)
      ON CONFLICT (user_id, team_member_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_managed_member_invite(
  p_token text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_member record;
  v_profile record;
  v_link_id uuid;
  v_mismatch boolean;
  v_signup_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.managed_member_invite_tokens
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;

  IF v_invite.consumed_at IS NOT NULL THEN
    IF v_invite.consumed_by = auth.uid() THEN
      RETURN json_build_object(
        'success', true,
        'already_consumed', true,
        'team_member_id', v_invite.team_member_id
      );
    END IF;
    RETURN json_build_object('success', false, 'error', 'Invite already used');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Invite expired');
  END IF;

  SELECT id, email, full_name
  INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_signup_email := lower(trim(COALESCE(v_profile.email, '')));

  SELECT id, supervisor_id, email, linked_user_id, full_name, is_placeholder
  INTO v_member
  FROM public.team_members
  WHERE id = v_invite.team_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Managed account no longer exists');
  END IF;

  IF v_member.linked_user_id IS NOT NULL AND v_member.linked_user_id <> auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Managed account already linked to another user');
  END IF;

  IF v_member.supervisor_id = auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You cannot link a managed account you supervise to yourself'
    );
  END IF;

  v_mismatch := (
    v_signup_email <> ''
    AND lower(trim(COALESCE(v_invite.invited_email, ''))) <> v_signup_email
  );

  INSERT INTO public.pending_managed_links (
    user_id,
    team_member_id,
    status,
    email_mismatch,
    invited_email,
    signup_email,
    email_update_status
  )
  VALUES (
    auth.uid(),
    v_invite.team_member_id,
    'pending',
    v_mismatch,
    lower(trim(v_invite.invited_email)),
    NULLIF(v_signup_email, ''),
    CASE WHEN v_mismatch THEN 'pending' ELSE NULL END
  )
  ON CONFLICT (user_id, team_member_id) DO UPDATE
  SET
    status = CASE
      WHEN pending_managed_links.status = 'rejected' THEN 'pending'
      ELSE pending_managed_links.status
    END,
    email_mismatch = EXCLUDED.email_mismatch,
    invited_email = EXCLUDED.invited_email,
    signup_email = EXCLUDED.signup_email,
    email_update_status = CASE
      WHEN EXCLUDED.email_mismatch THEN COALESCE(pending_managed_links.email_update_status, 'pending')
      ELSE pending_managed_links.email_update_status
    END,
    responded_at = CASE
      WHEN pending_managed_links.status = 'rejected' THEN NULL
      ELSE pending_managed_links.responded_at
    END
  RETURNING id INTO v_link_id;

  UPDATE public.team_members
  SET member_status = 'pending_link'
  WHERE id = v_invite.team_member_id
    AND linked_user_id IS NULL;

  UPDATE public.managed_member_invite_tokens
  SET
    consumed_at = now(),
    consumed_by = auth.uid()
  WHERE id = v_invite.id;

  RETURN json_build_object(
    'success', true,
    'link_id', v_link_id,
    'team_member_id', v_invite.team_member_id,
    'email_mismatch', v_mismatch,
    'invited_email', v_invite.invited_email,
    'signup_email', NULLIF(v_signup_email, ''),
    'member_name', v_member.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_managed_member_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
