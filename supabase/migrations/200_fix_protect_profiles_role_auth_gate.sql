-- Repair protect_profiles_role: SECURITY DEFINER made current_user always
-- postgres, which bypassed the authenticated-user block. Use auth.role()
-- for JWT sessions and session_user for direct SQL.

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

COMMENT ON FUNCTION public.protect_profiles_role() IS
  'Blocks authenticated self-service changes to profiles.role; service_role and postgres may still promote admins.';
