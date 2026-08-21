-- Explicit marketing / EPB-cycle email consent.
-- NULL = legacy account, never asked (CAN-SPAM relationship mail until they choose).
-- false = asked and declined, or new signup default.
-- true = asked and opted in.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean,
  ADD COLUMN IF NOT EXISTS marketing_email_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_email_opt_in_source text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_marketing_email_opt_in_source_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_marketing_email_opt_in_source_check
  CHECK (
    marketing_email_opt_in_source IS NULL
    OR marketing_email_opt_in_source IN ('signup', 'onboarding', 'settings')
  );

COMMENT ON COLUMN public.profiles.marketing_email_opt_in IS
  'Opt-in for non-essential email (EPB cycle reminders). NULL = never recorded; false = opted out; true = opted in.';

CREATE INDEX IF NOT EXISTS idx_profiles_marketing_email_opt_in_true
  ON public.profiles (id)
  WHERE marketing_email_opt_in IS TRUE;

-- Copy signup metadata; new accounts are false unless the checkbox was checked.
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
  v_marketing_opt_in boolean;
BEGIN
  v_rank := NEW.raw_user_meta_data->>'rank';
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  v_first_name := NEW.raw_user_meta_data->>'first_name';
  v_last_name := NEW.raw_user_meta_data->>'last_name';
  v_marketing_opt_in := COALESCE(NEW.raw_user_meta_data->>'marketing_email_opt_in', '')
    IN ('true', 't', '1');

  IF v_first_name IS NULL AND v_full_name IS NOT NULL AND v_full_name != '' THEN
    v_first_name := split_part(v_full_name, ' ', 1);
  END IF;

  IF v_last_name IS NULL AND v_full_name IS NOT NULL AND v_full_name != '' AND position(' ' in v_full_name) > 0 THEN
    v_last_name := substring(v_full_name from position(' ' in v_full_name) + 1);
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    first_name,
    last_name,
    avatar_url,
    role,
    rank,
    afsc,
    unit,
    terms_accepted_at,
    marketing_email_opt_in,
    marketing_email_opt_in_at,
    marketing_email_opt_in_source
  )
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
    NULL,
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN now() ELSE NULL END,
    CASE WHEN v_marketing_opt_in THEN 'signup' ELSE NULL END
  );

  IF NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL THEN
    PERFORM grant_signup_trial_credits(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
