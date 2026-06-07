-- "Use free credits first" preference for BYOK users with a remaining balance.
--
-- When ON (default), a user who has their own API key AND a positive credit
-- balance keeps the free app model (Gemini Flash Lite) as their default,
-- consuming credits first. When the balance hits 0, model resolution promotes
-- their own-key model automatically (handled in app code). When OFF, their
-- own model is the default immediately and credits sit dormant (never expire).

ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS prefer_credits_first BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_credits.prefer_credits_first IS 'When true, BYOK users with a positive balance default to the free app model until credits are exhausted, then cut over to their own-key model.';

-- Users may toggle only this preference; balance/lifetime columns stay
-- service-role-only. A SECURITY DEFINER function updates just this column for
-- the calling user, so we never expose a broad UPDATE policy on user_credits.
CREATE OR REPLACE FUNCTION set_credits_first_preference(p_prefer BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_credits (user_id, balance, prefer_credits_first)
  VALUES (v_uid, 0, p_prefer)
  ON CONFLICT (user_id) DO UPDATE SET
    prefer_credits_first = p_prefer,
    updated_at = now();

  RETURN p_prefer;
END;
$$;

REVOKE ALL ON FUNCTION set_credits_first_preference(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_credits_first_preference(BOOLEAN) TO authenticated;

COMMENT ON FUNCTION set_credits_first_preference(BOOLEAN) IS 'Lets the calling user toggle their prefer_credits_first flag without exposing a broad UPDATE policy on user_credits.';
