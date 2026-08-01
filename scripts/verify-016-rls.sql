-- Ad-hoc verification for advisor plan 016 (profiles SELECT + teams INSERT).
-- Runs entirely inside a transaction that is rolled back.
BEGIN;

\set A '22222222-2222-2222-2222-222222222222'
\set B '33333333-3333-3333-3333-333333333333'

-- Isolated user with no relationships at all.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
VALUES ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'isolated@test.af.mil', '',
        now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES ('99999999-9999-9999-9999-999999999999', 'isolated@test.af.mil', 'Iso Lated')
ON CONFLICT (id) DO NOTHING;

DELETE FROM teams
WHERE (supervisor_id = :'A'::uuid AND subordinate_id = :'B'::uuid)
   OR (supervisor_id = :'B'::uuid AND subordinate_id = :'A'::uuid);
DELETE FROM team_requests
WHERE (requester_id = :'A'::uuid AND target_id = :'B'::uuid)
   OR (requester_id = :'B'::uuid AND target_id = :'A'::uuid);

SET LOCAL ROLE authenticated;

\echo '=== ISOLATED USER (no relationships) ==='
SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true) \gset ignore_

\echo '-- 1. total profiles visible (expect 1: own row only)'
SELECT count(*) AS visible, bool_and(id = '99999999-9999-9999-9999-999999999999') AS only_self
FROM profiles;

\echo '-- 2. exact-email RPC still resolves a stranger (expect 1)'
SELECT count(*) AS hits FROM search_profile_by_email('TSgt.Williams@test.af.mil');

\echo '-- 3. directory search <3 chars (expect 0) / >=3 chars (expect <=10)'
SELECT (SELECT count(*) FROM search_profiles_directory('ts')) AS short_query,
       (SELECT count(*) FROM search_profiles_directory('test.af.mil')) AS long_query;

\echo '-- 4. teams INSERT with no accepted request (expect blocked)'
SAVEPOINT sp;
DO $$
BEGIN
  INSERT INTO teams (supervisor_id, subordinate_id)
  VALUES ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333');
  RAISE WARNING 'FAIL: insert succeeded';
EXCEPTION WHEN insufficient_privilege OR others THEN
  RAISE NOTICE 'PASS: blocked (%)', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp;

\echo ''
\echo '=== CONSENT FLOW: A invites B ==='
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset ignore_

\echo '-- 5. A creates a supervise request for B'
INSERT INTO team_requests (requester_id, target_id, request_type)
VALUES (:'A'::uuid, :'B'::uuid, 'supervise')
RETURNING id AS request_id \gset

\echo '-- 6. A (requester, not target) tries to self-accept (expect blocked)'
SAVEPOINT sp2;
DO $$
DECLARE r uuid;
BEGIN
  SELECT id INTO r FROM team_requests
  WHERE requester_id = '22222222-2222-2222-2222-222222222222'
    AND target_id = '33333333-3333-3333-3333-333333333333'
    AND status = 'pending';
  PERFORM respond_to_team_request(r, true);
  RAISE WARNING 'FAIL: requester self-accept succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: requester cannot self-accept (%)', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp2;

\echo '-- 7. A tries to insert the teams row directly while request is pending (expect blocked)'
SAVEPOINT sp3;
DO $$
BEGIN
  INSERT INTO teams (supervisor_id, subordinate_id)
  VALUES ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
  RAISE WARNING 'FAIL: insert succeeded without consent';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'PASS: blocked (%)', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp3;

\echo '-- 8. B (target) accepts via RPC'
SELECT set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset ignore_
SELECT respond_to_team_request(:'request_id'::uuid, true) AS accept_result;

\echo '-- 9. teams row created + request marked accepted'
SELECT
  (SELECT count(*) FROM teams WHERE supervisor_id = :'A'::uuid AND subordinate_id = :'B'::uuid) AS team_rows,
  (SELECT status FROM team_requests WHERE id = :'request_id'::uuid) AS request_status;

\echo '-- 10. accept is idempotent'
SELECT respond_to_team_request(:'request_id'::uuid, true) AS second_accept;

\echo '-- 11. B can see A (subordinate -> supervisor)'
SELECT count(*) AS b_can_see_a FROM profiles WHERE id = :'A'::uuid;

\echo '-- 12. A can see B (supervisor -> subordinate)'
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset ignore_
SELECT count(*) AS a_can_see_b FROM profiles WHERE id = :'B'::uuid;

\echo '-- 13. anon sees nothing'
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', NULL, true) \gset ignore_
SELECT count(*) AS anon_visible FROM profiles;

ROLLBACK;
