-- accept_supervisor_from_link must not INSERT a self-teams row (teams_check).
-- Run against local MyEPBuddy Postgres (54322). Always rolls back.
--
-- Invoked by: src/lib/__tests__/reject-self-supervisor-team-link.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_user CONSTANT UUID := '55555555-5555-5555-5555-555555555555';
  v_member_id UUID;
  v_link_id UUID;
  v_sqlstate TEXT;
  v_msg TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = c_user) THEN
    RAISE EXCEPTION 'missing seed profile %', c_user;
  END IF;

  INSERT INTO team_members (
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

  INSERT INTO pending_managed_links (user_id, team_member_id, status)
  VALUES (c_user, v_member_id, 'pending')
  RETURNING id INTO v_link_id;

  PERFORM set_config('request.jwt.claim.sub', c_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_user)::text, true);

  BEGIN
    PERFORM accept_supervisor_from_link(v_link_id);
    RAISE EXCEPTION 'expected accept_supervisor_from_link to reject self-supervisor';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      IF v_sqlstate = '23514' THEN
        RAISE EXCEPTION 'self-supervisor still hits teams_check: %', v_msg;
      END IF;
      IF v_sqlstate IS DISTINCT FROM '22023'
         OR v_msg NOT ILIKE '%cannot accept yourself%' THEN
        RAISE EXCEPTION 'unexpected error %: %', v_sqlstate, v_msg;
      END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM teams
    WHERE supervisor_id = c_user AND subordinate_id = c_user
  ) THEN
    RAISE EXCEPTION 'self-supervisor teams row was inserted';
  END IF;

  RAISE NOTICE 'PASS reject-self-supervisor: accept_supervisor_from_link raises 22023';
END;
$$;

ROLLBACK;
