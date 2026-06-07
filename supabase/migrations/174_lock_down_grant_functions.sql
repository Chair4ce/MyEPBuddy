-- CRITICAL SECURITY FIX: privilege escalation via grant functions.
--
-- Supabase's default privileges GRANT EXECUTE on new public functions to
-- `authenticated` (and `anon`). Migration 164 only did `REVOKE ... FROM PUBLIC`
-- for grant_credits, which does NOT remove the explicit `authenticated` grant.
-- Result: any logged-in user could call
--   grant_credits('<own-id>', 1000000, 'purchase', ...)
-- and mint unlimited credits. Same exposure for grant_signup_trial_credits.
--
-- Fix: (1) add an internal guard rejecting end-user (JWT) callers, and
--      (2) explicitly REVOKE EXECUTE from authenticated + anon.
-- Legitimate callers (Stripe webhook via service-role, signup/verify triggers
-- running without a user JWT) have auth.uid() = NULL and are unaffected.

CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount INT,
  p_type credit_transaction_type,
  p_stripe_event_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_stripe_checkout_session_id TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_new_balance INT;
BEGIN
  -- Server/service-role context only. End-user JWTs populate auth.uid().
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: credit grants are server-initiated only';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant amount must be positive';
  END IF;

  IF p_stripe_checkout_session_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
    ) THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  IF p_stripe_event_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE stripe_event_id = p_stripe_event_id
    ) THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
  VALUES (
    p_user_id,
    p_amount,
    p_type = 'trial',
    CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    0
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = user_credits.balance + p_amount,
    trial_granted = user_credits.trial_granted OR (p_type = 'trial'),
    lifetime_purchased = user_credits.lifetime_purchased +
      CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    stripe_event_id,
    stripe_checkout_session_id,
    description
  ) VALUES (
    p_user_id,
    p_type,
    p_amount,
    v_new_balance,
    p_stripe_event_id,
    p_stripe_checkout_session_id,
    p_description
  );

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_signup_trial_credits(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_credits INT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: trial grants are server-initiated only';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

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

REVOKE ALL ON FUNCTION grant_credits(UUID, INT, credit_transaction_type, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_credits(UUID, INT, credit_transaction_type, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.grant_signup_trial_credits(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_signup_trial_credits(UUID) TO service_role;

-- Strip stray anon grants on usage RPCs (guards already reject anon, but least privilege).
REVOKE ALL ON FUNCTION check_and_record_usage(UUID, TEXT, BOOLEAN, TEXT, TEXT, INT, INT) FROM anon;
