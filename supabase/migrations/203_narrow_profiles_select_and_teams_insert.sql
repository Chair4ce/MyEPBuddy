-- Plan 016: Narrow world-readable profiles SELECT + require consent for teams INSERT
--
-- Problem 1: migration 007 replaced the own-row/supervisor profile policies with
--   "Users can search profiles by email" USING (true), so any authenticated user
--   could dump every profile row (email, full name, unit, AFSC, role).
-- Problem 2: migration 008/061 allow any user to INSERT a teams row as long as
--   they are one side of it, so user A could attach user B to their chain with
--   no consent from B.
--
-- Fix:
--   1. can_view_profile(uuid) — SECURITY DEFINER predicate listing every existing
--      relationship that already grants sight of a person in this product.
--   2. profiles SELECT scoped to own row OR can_view_profile(id).
--   3. search_profile_by_email / search_profiles_directory RPCs so invite + share
--      UIs can still resolve people they have no relationship with yet, without
--      exposing the whole table.
--   4. respond_to_team_request(uuid, boolean) — atomic accept/decline that creates
--      the teams row, plus a teams INSERT policy that requires an accepted
--      team_requests row for the exact pair.

-- ============================================================================
-- 1. Relationship predicate
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_target IS NULL THEN
    RETURN false;
  END IF;

  IF p_target = v_me THEN
    RETURN true;
  END IF;

  -- Admin console (user feedback, grants) reads other profiles with the user client.
  IF EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_me AND p.role = 'admin') THEN
    RETURN true;
  END IF;

  -- Direct supervision, either direction.
  IF EXISTS (
    SELECT 1 FROM teams t
    WHERE (t.supervisor_id = v_me AND t.subordinate_id = p_target)
       OR (t.supervisor_id = p_target AND t.subordinate_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Full chain, both directions.
  IF EXISTS (SELECT 1 FROM get_subordinate_chain(v_me) c WHERE c.subordinate_id = p_target) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM get_supervisor_chain(v_me) c WHERE c.supervisor_id = p_target) THEN
    RETURN true;
  END IF;

  -- Co-supervisors: someone else who supervises a person in my subordinate chain.
  -- The team feed renders each subordinate's full supervisor chain.
  IF EXISTS (
    SELECT 1 FROM teams t
    WHERE t.supervisor_id = p_target
      AND t.subordinate_id IN (SELECT subordinate_id FROM get_subordinate_chain(v_me))
  ) THEN
    RETURN true;
  END IF;

  -- Prior supervision is retained on purpose (prior-subordinate data review).
  IF EXISTS (
    SELECT 1 FROM team_history th
    WHERE (th.supervisor_id = v_me AND th.subordinate_id = p_target)
       OR (th.supervisor_id = p_target AND th.subordinate_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Supervision invitations, any status (the request cards render both parties).
  IF EXISTS (
    SELECT 1 FROM team_requests r
    WHERE (r.requester_id = v_me AND r.target_id = p_target)
       OR (r.requester_id = p_target AND r.target_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Managed (placeholder) members that resolve to a real profile.
  IF EXISTS (
    SELECT 1 FROM team_members tm
    WHERE (tm.supervisor_id = v_me
             AND p_target IN (tm.linked_user_id, tm.original_profile_id, tm.parent_profile_id))
       OR (tm.supervisor_id = p_target
             AND v_me IN (tm.linked_user_id, tm.original_profile_id, tm.parent_profile_id))
  ) THEN
    RETURN true;
  END IF;

  -- Pending managed link: invitee <-> the supervisor who created the placeholder.
  IF EXISTS (
    SELECT 1
    FROM pending_managed_links pml
    JOIN team_members tm ON tm.id = pml.team_member_id
    WHERE (pml.user_id = v_me AND tm.supervisor_id = p_target)
       OR (pml.user_id = p_target AND tm.supervisor_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Explicit shares, either direction.
  IF EXISTS (
    SELECT 1 FROM statement_shares s
    WHERE (s.owner_id = v_me AND s.shared_with_id = p_target)
       OR (s.owner_id = p_target AND s.shared_with_id = v_me)
  ) OR EXISTS (
    SELECT 1 FROM epb_shell_shares s
    WHERE (s.owner_id = v_me AND s.shared_with_id = p_target)
       OR (s.owner_id = p_target AND s.shared_with_id = v_me)
  ) OR EXISTS (
    SELECT 1 FROM opb_shell_shares s
    WHERE (s.owner_id = v_me AND s.shared_with_id = p_target)
       OR (s.owner_id = p_target AND s.shared_with_id = v_me)
  ) OR EXISTS (
    SELECT 1 FROM award_shell_shares s
    WHERE (s.owner_id = v_me AND s.shared_with_id = p_target)
       OR (s.owner_id = p_target AND s.shared_with_id = v_me)
  ) OR EXISTS (
    SELECT 1 FROM decoration_shell_shares s
    WHERE (s.owner_id = v_me AND s.shared_with_id = p_target)
       OR (s.owner_id = p_target AND s.shared_with_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Content authored for me by someone else (or by me for them).
  IF EXISTS (
    SELECT 1 FROM refined_statements rs
    WHERE (rs.user_id = v_me AND rs.created_by = p_target)
       OR (rs.user_id = p_target AND rs.created_by = v_me)
  ) OR EXISTS (
    SELECT 1 FROM accomplishments a
    WHERE (a.user_id = v_me AND a.created_by = p_target)
       OR (a.user_id = p_target AND a.created_by = v_me)
  ) OR EXISTS (
    SELECT 1 FROM statement_history sh
    WHERE (sh.ratee_id = v_me AND sh.user_id = p_target)
       OR (sh.ratee_id = p_target AND sh.user_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Shells built for one person by another.
  IF EXISTS (
    SELECT 1 FROM epb_shells s
    WHERE (s.user_id = v_me AND s.created_by = p_target)
       OR (s.user_id = p_target AND s.created_by = v_me)
  ) OR EXISTS (
    SELECT 1 FROM opb_shells s
    WHERE (s.user_id = v_me AND s.created_by = p_target)
       OR (s.user_id = p_target AND s.created_by = v_me)
  ) OR EXISTS (
    SELECT 1 FROM award_shells s
    WHERE (s.user_id = v_me AND s.created_by = p_target)
       OR (s.user_id = p_target AND s.created_by = v_me)
  ) OR EXISTS (
    SELECT 1 FROM decoration_shells s
    WHERE (s.user_id = v_me AND s.created_by = p_target)
       OR (s.user_id = p_target AND s.created_by = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Feedback / expectations counterparties.
  IF EXISTS (
    SELECT 1 FROM supervisor_feedbacks sf
    WHERE (sf.supervisor_id = v_me AND sf.subordinate_id = p_target)
       OR (sf.supervisor_id = p_target AND sf.subordinate_id = v_me)
  ) OR EXISTS (
    SELECT 1 FROM supervisor_expectations se
    WHERE (se.supervisor_id = v_me AND se.subordinate_id = p_target)
       OR (se.supervisor_id = p_target AND se.subordinate_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Award request participants.
  IF EXISTS (
    SELECT 1 FROM award_requests ar
    WHERE v_me IN (ar.requester_id, ar.approver_id, ar.recipient_profile_id)
      AND p_target IN (ar.requester_id, ar.approver_id, ar.recipient_profile_id)
  ) THEN
    RETURN true;
  END IF;

  -- Project collaborators.
  IF EXISTS (
    SELECT 1
    FROM project_members mine
    JOIN project_members theirs ON theirs.project_id = mine.project_id
    WHERE mine.profile_id = v_me AND theirs.profile_id = p_target
  ) OR EXISTS (
    SELECT 1
    FROM projects pr
    JOIN project_members pm ON pm.project_id = pr.id
    WHERE (pr.created_by = v_me AND pm.profile_id = p_target)
       OR (pr.created_by = p_target AND pm.profile_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  -- Live collaboration sessions (workspace + EPB section editing).
  IF EXISTS (
    SELECT 1
    FROM workspace_session_participants mine
    JOIN workspace_session_participants theirs ON theirs.session_id = mine.session_id
    WHERE mine.user_id = v_me AND theirs.user_id = p_target
  ) OR EXISTS (
    SELECT 1
    FROM workspace_sessions ws
    JOIN workspace_session_participants wp ON wp.session_id = ws.id
    WHERE (ws.host_user_id = v_me AND wp.user_id = p_target)
       OR (ws.host_user_id = p_target AND wp.user_id = v_me)
  ) OR EXISTS (
    SELECT 1
    FROM epb_section_editing_participants mine
    JOIN epb_section_editing_participants theirs ON theirs.session_id = mine.session_id
    WHERE mine.user_id = v_me AND theirs.user_id = p_target
  ) OR EXISTS (
    SELECT 1
    FROM epb_section_editing_sessions es
    JOIN epb_section_editing_participants ep ON ep.session_id = es.id
    WHERE (es.host_user_id = v_me AND ep.user_id = p_target)
       OR (es.host_user_id = p_target AND ep.user_id = v_me)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_view_profile(uuid) IS
  'True when the calling user already has a relationship with p_target (supervision chain, invitation, managed link, share, collaboration, admin). Backs the profiles SELECT policy.';

REVOKE ALL ON FUNCTION public.can_view_profile(uuid) FROM PUBLIC;
-- anon needs EXECUTE because the profiles SELECT policy applies to every role;
-- without the grant an unauthenticated read raises 42501 instead of returning
-- zero rows. The function itself short-circuits to false when auth.uid() is null.
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- 2. Replace world-readable profiles SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Users can search profiles by email" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Supervisors can view subordinates profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view related profiles" ON profiles;

CREATE POLICY "Users can view related profiles"
  ON profiles FOR SELECT
  USING (
    id = (select auth.uid())
    OR public.can_view_profile(id)
  );

-- ============================================================================
-- 3. Constrained lookup RPCs (replace client-side `from('profiles')` scans)
-- ============================================================================

-- Exact, case-insensitive email match. Used by the supervision invite dialog and
-- the managed-member dialogs to detect "this person already has an account".
CREATE OR REPLACE FUNCTION public.search_profile_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  rank public.user_rank,
  afsc text,
  unit text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.full_name, p.rank, p.afsc, p.unit
  FROM profiles p
  WHERE auth.uid() IS NOT NULL
    AND btrim(p_email) <> ''
    AND lower(p.email) = lower(btrim(p_email))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.search_profile_by_email(text) IS
  'Exact case-insensitive email lookup returning directory columns only. Replaces the world-readable profiles SELECT for invite flows.';

REVOKE ALL ON FUNCTION public.search_profile_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profile_by_email(text) TO authenticated;

-- Name/email substring lookup for the share dialogs. Requires >= 3 characters and
-- returns at most 10 rows so the table cannot be enumerated, and takes the query
-- as a bound parameter instead of an interpolated PostgREST `or=` filter.
CREATE OR REPLACE FUNCTION public.search_profiles_directory(p_query text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  rank public.user_rank,
  afsc text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.full_name, p.rank, p.afsc
  FROM profiles p
  WHERE auth.uid() IS NOT NULL
    AND length(btrim(p_query)) >= 3
    AND p.id <> auth.uid()
    AND (
      p.full_name ILIKE '%' || btrim(p_query) || '%'
      OR p.email ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY
    (lower(p.email) = lower(btrim(p_query))) DESC,
    p.full_name NULLS LAST
  LIMIT 10;
$$;

COMMENT ON FUNCTION public.search_profiles_directory(text) IS
  'Bounded people-picker search (min 3 chars, max 10 rows, directory columns only) for share dialogs.';

REVOKE ALL ON FUNCTION public.search_profiles_directory(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profiles_directory(text) TO authenticated;

-- ============================================================================
-- 4. Consent-gated team relationships
-- ============================================================================

-- Atomic accept/decline. Previously the client updated team_requests and then
-- upserted teams in two round trips, which could leave a request marked accepted
-- with no team row.
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
  v_request team_requests%ROWTYPE;
  v_supervisor_id uuid;
  v_subordinate_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM team_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only the invited party may respond.
  IF v_request.target_id <> v_me THEN
    RAISE EXCEPTION 'Not authorized to respond to this request' USING ERRCODE = '42501';
  END IF;

  IF v_request.status = 'declined' THEN
    RETURN json_build_object('success', true, 'status', 'declined');
  END IF;

  IF NOT p_accept THEN
    UPDATE team_requests
    SET status = 'declined', responded_at = now()
    WHERE id = p_request_id;

    RETURN json_build_object('success', true, 'status', 'declined');
  END IF;

  IF v_request.request_type = 'supervise' THEN
    -- Requester asked to supervise me.
    v_supervisor_id := v_request.requester_id;
    v_subordinate_id := v_request.target_id;
  ELSE
    -- Requester asked me to supervise them.
    v_supervisor_id := v_request.target_id;
    v_subordinate_id := v_request.requester_id;
  END IF;

  IF v_request.status <> 'accepted' THEN
    UPDATE team_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
  END IF;

  INSERT INTO teams (supervisor_id, subordinate_id)
  VALUES (v_supervisor_id, v_subordinate_id)
  ON CONFLICT (supervisor_id, subordinate_id) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'status', 'accepted',
    'supervisor_id', v_supervisor_id,
    'subordinate_id', v_subordinate_id
  );
END;
$$;

COMMENT ON FUNCTION public.respond_to_team_request(uuid, boolean) IS
  'Target-only accept/decline for a supervision request; creates the teams row in the same transaction.';

REVOKE ALL ON FUNCTION public.respond_to_team_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_team_request(uuid, boolean) TO authenticated;

-- teams INSERT now requires consent: an accepted team_requests row for exactly
-- this (supervisor, subordinate) pair, with the caller on one side of it. The
-- SECURITY DEFINER paths (respond_to_team_request, accept_supervisor_from_link)
-- are unaffected; direct client inserts without consent are not.
DROP POLICY IF EXISTS "Users can create team relationships they're part of" ON teams;
DROP POLICY IF EXISTS "Supervisors can add subordinates" ON teams;
DROP POLICY IF EXISTS "Team relationships require an accepted request" ON teams;

CREATE POLICY "Team relationships require an accepted request"
  ON teams FOR INSERT
  WITH CHECK (
    (
      teams.supervisor_id = (select auth.uid())
      OR teams.subordinate_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM team_requests r
      WHERE r.status = 'accepted'
        AND (
          (r.request_type = 'supervise'
             AND r.requester_id = teams.supervisor_id
             AND r.target_id = teams.subordinate_id)
          OR (r.request_type = 'be_supervised'
             AND r.requester_id = teams.subordinate_id
             AND r.target_id = teams.supervisor_id)
        )
    )
  );
