-- Match managed-account emails case-insensitively when a profile is created/updated.
-- team_members.email is stored lowercase; auth/profile emails can differ in case.

CREATE OR REPLACE FUNCTION public.link_managed_members_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.pending_managed_links (user_id, team_member_id)
    SELECT NEW.id, tm.id
    FROM public.team_members tm
    WHERE LOWER(tm.email) = LOWER(NEW.email)
      AND tm.linked_user_id IS NULL
      AND tm.is_placeholder = true
    ON CONFLICT (user_id, team_member_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
