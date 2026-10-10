-- Inserting an EPB shell share must not raise 42P17 (policy recursion).
-- The owner can insert and read the recipient profile in the same statement.
-- A stranger is rejected by RLS (42501), not by the recursion error.
-- Self-contained; always rolls back.
--
-- Invoked by: src/lib/__tests__/epb-shell-share-insert.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
)
VALUES
  (
    'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'epb-share-owner@example.com', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Share Owner"}'::jsonb, now(), now(), '', ''
  ),
  (
    'd4d4d4d4-d4d4-44d4-a4d4-d4d4d4d4d4d4',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'epb-share-recipient@example.com', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Share Recipient"}'::jsonb, now(), now(), '', ''
  ),
  (
    'e5e5e5e5-e5e5-45e5-a5e5-e5e5e5e5e5e5',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'epb-share-stranger@example.com', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Share Stranger"}'::jsonb, now(), now(), '', ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name)
VALUES
  ('c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3', 'epb-share-owner@example.com', 'Share Owner'),
  ('d4d4d4d4-d4d4-44d4-a4d4-d4d4d4d4d4d4', 'epb-share-recipient@example.com', 'Share Recipient'),
  ('e5e5e5e5-e5e5-45e5-a5e5-e5e5e5e5e5e5', 'epb-share-stranger@example.com', 'Share Stranger')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.epb_shells (id, user_id, created_by, cycle_year, team_member_id)
VALUES (
  'f6f6f6f6-f6f6-46f6-a6f6-f6f6f6f6f6f6',
  'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3',
  'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3',
  2099,
  NULL
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3","role":"authenticated"}',
  true
);

INSERT INTO public.epb_shell_shares (shell_id, owner_id, share_type, shared_with_id)
VALUES (
  'f6f6f6f6-f6f6-46f6-a6f6-f6f6f6f6f6f6',
  'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3',
  'user',
  'd4d4d4d4-d4d4-44d4-a4d4-d4d4d4d4d4d4'
);

DO $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT p.id INTO v_profile_id
  FROM public.epb_shell_shares s
  LEFT JOIN public.profiles p ON p.id = s.shared_with_id
  WHERE s.shell_id = 'f6f6f6f6-f6f6-46f6-a6f6-f6f6f6f6f6f6'
    AND s.owner_id = 'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3';

  IF v_profile_id IS DISTINCT FROM 'd4d4d4d4-d4d4-44d4-a4d4-d4d4d4d4d4d4'::uuid THEN
    RAISE EXCEPTION 'owner could not read the recipient profile after sharing (got %)', v_profile_id;
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e5e5e5e5-e5e5-45e5-a5e5-e5e5e5e5e5e5', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"e5e5e5e5-e5e5-45e5-a5e5-e5e5e5e5e5e5","role":"authenticated"}',
  true
);

DO $$
DECLARE
  v_sqlstate TEXT;
BEGIN
  BEGIN
    INSERT INTO public.epb_shell_shares (shell_id, owner_id, share_type, shared_with_id)
    VALUES (
      'f6f6f6f6-f6f6-46f6-a6f6-f6f6f6f6f6f6',
      'e5e5e5e5-e5e5-45e5-a5e5-e5e5e5e5e5e5',
      'user',
      'c3c3c3c3-c3c3-43c3-a3c3-c3c3c3c3c3c3'
    );
    RAISE EXCEPTION 'stranger insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
      IF v_sqlstate IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'expected 42501, got %', v_sqlstate;
      END IF;
  END;

  RAISE NOTICE 'PASS epb-shell-share: owner insert avoids policy recursion';
END $$;

ROLLBACK;
