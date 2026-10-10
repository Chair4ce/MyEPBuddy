-- Sharing a shell 500s with SQLSTATE 42P17:
--   infinite recursion detected in policy for relation "epb_shell_shares"
--
-- The INSERT policy reads the parent shell under RLS, and that shell's
-- "view shared shells" SELECT policy reads the share table. Postgres treats
-- that as a policy cycle and rejects the statement at parse time, before
-- the row is written. Award, decoration, and OPB shares have the same shape.
--
-- SECURITY DEFINER checks read the shell tables as the owner (RLS off,
-- FORCE ROW LEVEL SECURITY is not set) and return only a boolean. The
-- predicates match the previous WITH CHECK clauses exactly.

CREATE OR REPLACE FUNCTION public.can_create_epb_shell_share(
  p_shell_id uuid,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner_id IS NOT NULL
     AND p_owner_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.epb_shells es
       WHERE es.id = p_shell_id
         AND (
           (es.user_id = (SELECT auth.uid()) AND es.team_member_id IS NULL)
           OR (
             es.team_member_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_history th
               WHERE th.subordinate_id = es.user_id
                 AND th.supervisor_id = (SELECT auth.uid())
             )
           )
           OR (
             es.team_member_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_members tm
               WHERE tm.id = es.team_member_id
                 AND tm.supervisor_id = (SELECT auth.uid())
             )
           )
         )
     );
$$;

CREATE OR REPLACE FUNCTION public.can_create_award_shell_share(
  p_shell_id uuid,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner_id IS NOT NULL
     AND p_owner_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.award_shells aws
       WHERE aws.id = p_shell_id
         AND (
           (aws.user_id = (SELECT auth.uid()) AND aws.team_member_id IS NULL)
           OR (
             aws.team_member_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_history th
               WHERE th.subordinate_id = aws.user_id
                 AND th.supervisor_id = (SELECT auth.uid())
             )
           )
           OR (
             aws.team_member_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_members tm
               WHERE tm.id = aws.team_member_id
                 AND tm.supervisor_id = (SELECT auth.uid())
             )
           )
         )
     );
$$;

CREATE OR REPLACE FUNCTION public.can_create_decoration_shell_share(
  p_shell_id uuid,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner_id IS NOT NULL
     AND p_owner_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.decoration_shells ds
       WHERE ds.id = p_shell_id
         AND (
           (ds.user_id = (SELECT auth.uid()) AND ds.team_member_id IS NULL)
           OR (
             ds.team_member_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_history th
               WHERE th.subordinate_id = ds.user_id
                 AND th.supervisor_id = (SELECT auth.uid())
             )
           )
           OR (
             ds.team_member_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.team_members tm
               WHERE tm.id = ds.team_member_id
                 AND tm.supervisor_id = (SELECT auth.uid())
             )
           )
         )
     );
$$;

CREATE OR REPLACE FUNCTION public.can_create_opb_shell_share(
  p_shell_id uuid,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner_id IS NOT NULL
     AND p_owner_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.opb_shells os
       WHERE os.id = p_shell_id
         AND os.user_id = (SELECT auth.uid())
     );
$$;

COMMENT ON FUNCTION public.can_create_epb_shell_share(uuid, uuid) IS
  'INSERT check for epb_shell_shares. SECURITY DEFINER so the shell lookup does not re-enter epb_shell_shares RLS.';
COMMENT ON FUNCTION public.can_create_award_shell_share(uuid, uuid) IS
  'INSERT check for award_shell_shares. SECURITY DEFINER so the shell lookup does not re-enter award_shell_shares RLS.';
COMMENT ON FUNCTION public.can_create_decoration_shell_share(uuid, uuid) IS
  'INSERT check for decoration_shell_shares. SECURITY DEFINER so the shell lookup does not re-enter decoration_shell_shares RLS.';
COMMENT ON FUNCTION public.can_create_opb_shell_share(uuid, uuid) IS
  'INSERT check for opb_shell_shares. SECURITY DEFINER so the shell lookup does not re-enter opb_shell_shares RLS.';

REVOKE ALL ON FUNCTION public.can_create_epb_shell_share(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_award_shell_share(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_decoration_shell_share(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_opb_shell_share(uuid, uuid) FROM PUBLIC;

-- anon needs EXECUTE because PostgREST evaluates the INSERT policy for every
-- role. auth.uid() is null for anon, so the function returns false.
GRANT EXECUTE ON FUNCTION public.can_create_epb_shell_share(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_award_shell_share(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_decoration_shell_share(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_opb_shell_share(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Users can create shell shares" ON public.epb_shell_shares;
CREATE POLICY "Users can create shell shares"
  ON public.epb_shell_shares FOR INSERT
  WITH CHECK (public.can_create_epb_shell_share(shell_id, owner_id));

DROP POLICY IF EXISTS "Users can create award shell shares" ON public.award_shell_shares;
CREATE POLICY "Users can create award shell shares"
  ON public.award_shell_shares FOR INSERT
  WITH CHECK (public.can_create_award_shell_share(shell_id, owner_id));

DROP POLICY IF EXISTS "Users can create decoration shell shares" ON public.decoration_shell_shares;
CREATE POLICY "Users can create decoration shell shares"
  ON public.decoration_shell_shares FOR INSERT
  WITH CHECK (public.can_create_decoration_shell_share(shell_id, owner_id));

DROP POLICY IF EXISTS "Officers can create opb shell shares" ON public.opb_shell_shares;
CREATE POLICY "Officers can create opb shell shares"
  ON public.opb_shell_shares FOR INSERT
  WITH CHECK (public.can_create_opb_shell_share(shell_id, owner_id));
