-- Defer signup trial credits until the user verifies email or phone.
-- Prevents farming accounts via unconfirmed magic-link / OTP signups.

CREATE OR REPLACE FUNCTION public.grant_signup_trial_credits(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_credits INT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Idempotent: one trial grant per user
  IF EXISTS (
    SELECT 1
    FROM user_credits
    WHERE user_id = p_user_id
      AND trial_granted = true
  ) THEN
    RETURN;
  END IF;

  SELECT signup_trial_credits INTO v_trial_credits
  FROM epb_config
  WHERE id = 1;

  v_trial_credits := COALESCE(v_trial_credits, 20);

  PERFORM grant_credits(
    p_user_id,
    v_trial_credits,
    'trial',
    NULL,
    format('Welcome trial — %s AI calls', v_trial_credits)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_signup_trial_credits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_signup_trial_credits(UUID) TO service_role;

-- Profile only on signup; trial credits granted after verification
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
  v_rank := NEW.raw_user_meta_data->>'rank';
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  v_first_name := NEW.raw_user_meta_data->>'first_name';
  v_last_name := NEW.raw_user_meta_data->>'last_name';

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
    terms_accepted_at
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
    NULL
  );

  -- OAuth / pre-verified providers: grant immediately on insert
  IF NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL THEN
    PERFORM grant_signup_trial_credits(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_user_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
      PERFORM grant_signup_trial_credits(NEW.id);
    END IF;

    IF OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL THEN
      PERFORM grant_signup_trial_credits(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_verified ON auth.users;

CREATE TRIGGER on_auth_user_verified
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_verified();

COMMENT ON FUNCTION public.grant_signup_trial_credits(UUID) IS
  'Grants configurable signup trial credits once, after email or phone verification.';
