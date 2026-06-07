-- Configurable signup trial credits (admin-controlled, new signups only).
-- One-time cap: trial-only users reduced to 20 credits now.

ALTER TABLE epb_config
  ADD COLUMN IF NOT EXISTS signup_trial_credits INT NOT NULL DEFAULT 20
  CHECK (signup_trial_credits >= 1 AND signup_trial_credits <= 1000);

COMMENT ON COLUMN epb_config.signup_trial_credits IS
  'AI call credits granted once at signup. Changing this affects only new accounts; existing balances are unchanged.';

UPDATE epb_config SET signup_trial_credits = 20 WHERE id = 1;

-- Cap existing trial-only balances at 20 (skip users who purchased credits).
UPDATE user_credits
SET
  balance = LEAST(balance, 20),
  updated_at = now()
WHERE lifetime_purchased = 0;

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
  v_trial_credits INT;
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

  SELECT signup_trial_credits INTO v_trial_credits
  FROM epb_config
  WHERE id = 1;

  v_trial_credits := COALESCE(v_trial_credits, 20);

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

  PERFORM grant_credits(
    NEW.id,
    v_trial_credits,
    'trial',
    NULL,
    format('Welcome trial — %s AI calls', v_trial_credits)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
