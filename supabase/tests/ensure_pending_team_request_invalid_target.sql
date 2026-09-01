-- ensure_pending_team_request must return JSON for self-target, not RAISE 22023.
-- Self-contained; always rolls back.
--
-- Invoked by: src/lib/__tests__/ensure-pending-team-request-invalid-target.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_user CONSTANT UUID := 'b2b2b2b2-b2b2-42b2-b2b2-b2b2b2b2b2b2';
  v_result json;
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
    'self-ensure-rpc-test@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Self Ensure Test"}'::jsonb,
    now(),
    now(),
    '',
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (c_user, 'self-ensure-rpc-test@example.com', 'Self Ensure Test')
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', c_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_user)::text, true);

  v_result := public.ensure_pending_team_request(c_user, 'supervise', NULL);

  IF (v_result->>'success') IS DISTINCT FROM 'false'
     OR (v_result->>'status') IS DISTINCT FROM 'invalid_target' THEN
    RAISE EXCEPTION 'expected invalid_target JSON, got %', v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_requests
    WHERE requester_id = c_user AND target_id = c_user
  ) THEN
    RAISE EXCEPTION 'self team_request row was inserted';
  END IF;

  RAISE NOTICE 'PASS ensure-pending-invalid-target: returns JSON invalid_target';
END;
$$;

ROLLBACK;
