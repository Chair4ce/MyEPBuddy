-- Restore EXECUTE on RLS helper functions for anon (and service_role).
--
-- Root cause: migration 101 revoked EXECUTE on ALL public functions from anon/PUBLIC,
-- then re-granted only to authenticated. Several SECURITY DEFINER helpers are invoked
-- from RLS policies, so an unauthenticated (anon) SELECT raises 42501
-- "permission denied for function …" instead of returning zero rows.
--
-- Migration 203 already fixed this for can_view_profile with the same rationale.
-- get_subordinate_chain / get_supervisor_chain originally had anon EXECUTE in 013;
-- can_view_team_member was only granted to authenticated in 057 but is used the same
-- way in the team_members SELECT policy.
--
-- The functions short-circuit or evaluate auth.uid() themselves; granting EXECUTE to
-- anon does not widen data access — it only lets the policy expression run.

REVOKE ALL ON FUNCTION public.get_subordinate_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subordinate_chain(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_supervisor_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supervisor_chain(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_subordinate_chain(uuid) IS
  'SECURITY DEFINER subordinate walk used by RLS and RPC. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';

COMMENT ON FUNCTION public.get_supervisor_chain(uuid) IS
  'SECURITY DEFINER supervisor walk used by RLS and RPC. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';

COMMENT ON FUNCTION public.can_view_team_member(uuid, uuid, uuid, uuid, uuid) IS
  'SECURITY DEFINER predicate for team_members SELECT RLS. anon EXECUTE required so unauthenticated policy evaluation returns no rows instead of 42501.';
