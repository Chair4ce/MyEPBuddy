-- Resend webhook contact sync looks up one profile by email.
-- ilike cannot use a btree. An equality on lower(email) can.
-- Does not drop existing indexes. Does not change RLS or pool settings.
--
-- PostgREST cannot filter on an expression, so email_lower(profiles) is a
-- computed field whose body is lower(email). It is intentionally not
-- SECURITY DEFINER and has no SET clause so the planner can inline it to
-- lower(email) and use idx_profiles_email_lower. Adding search_path would
-- block that inlining and leave the index unused.
-- Unnamed argument: PostgREST treats this as a computed field, not an RPC.
-- lower is schema-qualified so the body does not depend on the caller's
-- search_path (the advisor still reports function_search_path_mutable because
-- there is no SET clause; that is intentional, see above).

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (lower(email));

CREATE OR REPLACE FUNCTION public.email_lower(public.profiles)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT pg_catalog.lower($1.email);
$$;

COMMENT ON FUNCTION public.email_lower(public.profiles) IS
  'Computed field for case-insensitive profile email equality. Inlines to lower(email) so idx_profiles_email_lower applies. Used by the Resend webhook.';

-- Supabase default privileges grant EXECUTE on new public functions to anon
-- and authenticated explicitly, so REVOKE FROM PUBLIC alone is not enough
-- (see migration 174). Only the service-role webhook needs this field.
REVOKE ALL ON FUNCTION public.email_lower(public.profiles) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_lower(public.profiles) FROM anon;
REVOKE ALL ON FUNCTION public.email_lower(public.profiles) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.email_lower(public.profiles) TO service_role;
