-- Freeze profiles.role against self-service privilege escalation.
-- Authenticated users may UPDATE their own row (RLS), but must not change role.
-- Admins are promoted only via service_role (admin client / support ops) or
-- direct postgres/supabase_admin sessions — not via the user JWT.
--
-- Note: this function is SECURITY DEFINER, so current_user is the owner
-- (postgres). Use auth.role() for PostgREST JWTs and session_user for
-- direct SQL — never current_user for the privilege bypass.

CREATE OR REPLACE FUNCTION public.protect_profiles_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- PostgREST / Supabase request: only service_role JWT may change role
  IF auth.role() IS NOT NULL THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Changing profiles.role is not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- No JWT (psql / migrations): allow postgres and supabase_admin
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Changing profiles.role is not permitted'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_role ON public.profiles;

CREATE TRIGGER trg_protect_profiles_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role();

COMMENT ON FUNCTION public.protect_profiles_role() IS
  'Blocks authenticated self-service changes to profiles.role; service_role and postgres may still promote admins.';
