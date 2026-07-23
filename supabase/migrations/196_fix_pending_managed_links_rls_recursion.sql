-- Fix 42P17 infinite RLS recursion between team_members and pending_managed_links.
--
-- Regression from 195_managed_member_invite_tokens:
--   pending_managed_links "Supervisors can view..." SELECT → team_members
--   team_members "Users can view team_members with pending links..." SELECT → pending_managed_links
--
-- Break the cycle with SECURITY DEFINER helpers (same pattern as 057).

CREATE OR REPLACE FUNCTION public.is_direct_supervisor_of_team_member(
  p_team_member_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.id = p_team_member_id
      AND tm.supervisor_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_direct_supervisor_of_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_direct_supervisor_of_team_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_pending_link_to_team_member(
  p_team_member_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pending_managed_links pml
    WHERE pml.team_member_id = p_team_member_id
      AND pml.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_pending_link_to_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_pending_link_to_team_member(uuid, uuid) TO authenticated;

-- pending_managed_links: supervisor visibility (was direct team_members subquery)
DROP POLICY IF EXISTS "Supervisors can view pending links for their members"
  ON public.pending_managed_links;
CREATE POLICY "Supervisors can view pending links for their members"
  ON public.pending_managed_links
  FOR SELECT
  TO authenticated
  USING (
    public.is_direct_supervisor_of_team_member(team_member_id, (select auth.uid()))
  );

-- team_members: pending-link visibility (was direct pending_managed_links subquery)
DROP POLICY IF EXISTS "Users can view team_members with pending links to them"
  ON public.team_members;
CREATE POLICY "Users can view team_members with pending links to them"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_pending_link_to_team_member(id, (select auth.uid()))
  );

-- invite-token insert check also queried team_members under RLS
DROP POLICY IF EXISTS "Supervisors can create invite tokens"
  ON public.managed_member_invite_tokens;
CREATE POLICY "Supervisors can create invite tokens"
  ON public.managed_member_invite_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND public.is_direct_supervisor_of_team_member(team_member_id, (select auth.uid()))
  );
