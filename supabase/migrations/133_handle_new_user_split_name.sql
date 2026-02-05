-- Update handle_new_user to populate first_name and last_name from signup metadata
-- Falls back to splitting full_name if separate fields are not provided (e.g. Google OAuth)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
BEGIN
  -- Get rank from metadata (may be null)
  v_rank := NEW.raw_user_meta_data->>'rank';

  -- Get name fields from metadata
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  v_first_name := NEW.raw_user_meta_data->>'first_name';
  v_last_name := NEW.raw_user_meta_data->>'last_name';

  -- If first/last not provided explicitly, derive from full_name (e.g. Google OAuth)
  IF v_first_name IS NULL AND v_full_name IS NOT NULL AND v_full_name != '' THEN
    v_first_name := split_part(v_full_name, ' ', 1);
  END IF;

  IF v_last_name IS NULL AND v_full_name IS NOT NULL AND v_full_name != '' AND position(' ' in v_full_name) > 0 THEN
    -- Everything after the first space (handles middle names)
    v_last_name := substring(v_full_name from position(' ' in v_full_name) + 1);
  END IF;

  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, avatar_url, role, rank, afsc, unit, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_first_name,
    v_last_name,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'member',
    CASE 
      WHEN v_rank IS NOT NULL AND v_rank != '' THEN v_rank::user_rank 
      ELSE NULL 
    END,
    NEW.raw_user_meta_data->>'afsc',
    NEW.raw_user_meta_data->>'unit',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
