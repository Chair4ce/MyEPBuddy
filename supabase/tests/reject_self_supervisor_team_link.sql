-- accept_supervisor_from_link must not INSERT a self-teams row (teams_check).
-- Self-contained: creates a throwaway auth user + profile, then rolls back.
--
-- Invoked by: src/lib/__tests__/reject-self-supervisor-team-link.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_user CONSTANT UUID := 'a1a1a1a1-a1a1-41a1-a1a1-a1a1a1a1a1a1';
  v_member_id UUID;
  v_link_id UUID;
  v_sqlstate TEXT;
  v_msg TEXT;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  )
  VALUES (
    c_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'self-supervisor-rpc-test@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Self Supervisor Test"}'::jsonb,
    now(),
    now(),
    '',
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (c_user, 'self-supervisor-rpc-test@example.com', 'Self Supervisor Test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (
    supervisor_id,
    parent_profile_id,
    full_name,
    email,
    is_placeholder
  )
  VALUES (
    c_user,
    c_user,
    'Self Managed',
    'self-supervisor-link-test@example.com',
    true
  )
  RETURNING id INTO v_member_id;

  INSERT INTO public.pending_managed_links (user_id, team_member_id, status)
  VALUES (c_user, v_member_id, 'pending')
  RETURNING id INTO v_link_id;

  PERFORM set_config('request.jwt.claim.sub', c_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_user)::text, true);

  BEGIN
    PERFORM public.accept_supervisor_from_link(v_link_id);
    RAISE EXCEPTION 'expected accept_supervisor_from_link to reject self-supervisor';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      IF v_sqlstate = 'P0001' AND v_msg = 'expected accept_supervisor_from_link to reject self-supervisor' THEN
        RAISE;
      END IF;
      IF v_sqlstate = '23514' THEN
        RAISE EXCEPTION 'self-supervisor still hits teams_check: %', v_msg;
      END IF;
      IF v_sqlstate IS DISTINCT FROM '22023'
         OR v_msg NOT ILIKE '%cannot accept yourself%' THEN
        RAISE EXCEPTION 'unexpected error %: %', v_sqlstate, v_msg;
      END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE supervisor_id = c_user AND subordinate_id = c_user
  ) THEN
    RAISE EXCEPTION 'self-supervisor teams row was inserted';
  END IF;

  RAISE NOTICE 'PASS reject-self-supervisor: accept_supervisor_from_link raises 22023';
END;
$$;

ROLLBACK;
