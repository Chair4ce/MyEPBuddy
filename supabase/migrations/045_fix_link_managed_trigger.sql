-- Fix the link_managed_members_by_email function to use proper search_path
-- This fixes the "relation pending_managed_links does not exist" error during signup

CREATE OR REPLACE FUNCTION public.link_managed_members_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- When a new profile is created with an email, create pending links
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.pending_managed_links (user_id, team_member_id)
    SELECT NEW.id, tm.id
    FROM public.team_members tm
    WHERE tm.email = NEW.email
      AND tm.linked_user_id IS NULL
      AND tm.is_placeholder = true
    ON CONFLICT (user_id, team_member_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;





