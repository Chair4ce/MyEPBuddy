-- Update handle_new_user to copy rank, afsc, and unit from user metadata
-- This ensures signup data is saved even before email verification
-- (The profile update after signup fails due to RLS before verification)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, rank, afsc, unit, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'member',
    NEW.raw_user_meta_data->>'rank',
    NEW.raw_user_meta_data->>'afsc',
    NEW.raw_user_meta_data->>'unit',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
