-- Restore EXECUTE on RLS helper functions for anon (and service_role).
--
-- Root cause: migration 101 revoked EXECUTE on ALL public functions from anon/PUBLIC,
-- then re-granted only to authenticated. Several SECURITY DEFINER helpers are invoked
-- from RLS policies (PUBLIC / no TO clause), so an unauthenticated (anon) SELECT raises
-- 42501 "permission denied for function …" instead of returning zero rows.
--
-- Migration 203 already fixed this for can_view_profile with the same rationale.
-- get_subordinate_chain / get_supervisor_chain originally had anon EXECUTE in 013;
-- the others below were never re-granted to anon after 101 but are still called from
-- PUBLIC policies.
--
-- Granting EXECUTE to anon does not widen data access — the helpers are SECURITY
-- DEFINER predicates / auth.uid()-gated; it only lets the policy expression run.
-- Helpers used only in TO authenticated policies are intentionally omitted.

-- ============================================================================
-- Chain / team_members helpers (reported 42501s)
-- ============================================================================

REVOKE ALL ON FUNCTION public.get_subordinate_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subordinate_chain(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_supervisor_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supervisor_chain(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid)
  TO anon, authenticated, service_role;

-- ============================================================================
-- Other helpers called from PUBLIC RLS policies (same 42501 class)
-- ============================================================================

-- Signature after 102: (uuid, integer DEFAULT 20) — identity args include the int.
REVOKE ALL ON FUNCTION public.get_visible_managed_members(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_managed_members(uuid, integer)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_project_owners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_project_owners(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_add_project_member(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_add_project_member(uuid, uuid, uuid, uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_in_accomplishment_chain(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_in_accomplishment_chain(uuid, uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.user_can_access_shell(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_shell(uuid, uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_subordinate_chain(uuid) IS
  'SECURITY DEFINER subordinate walk used by RLS and RPC. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';

COMMENT ON FUNCTION public.get_supervisor_chain(uuid) IS
  'SECURITY DEFINER supervisor walk used by RLS and RPC. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';

COMMENT ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid) IS
  'SECURITY DEFINER predicate for team_members SELECT RLS. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';
