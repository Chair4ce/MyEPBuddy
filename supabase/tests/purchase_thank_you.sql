-- Lifetime first-100 thank-you claim. Rolls back.
-- Invoked by: src/lib/__tests__/purchase-thank-you.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.seed_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) VALUES (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Thank You Test'),
    now(),
    now(),
    '',
    ''
  );
END;
$$;

DO $$
DECLARE
  c_first uuid := 'b1111111-1111-4111-8111-111111111111';
  c_repeat uuid := 'b2222222-2222-4222-8222-222222222222';
  c_other uuid := 'b3333333-3333-4333-8333-333333333333';
  c_optout uuid := 'b4444444-4444-4444-8444-444444444444';
  c_suppressed uuid := 'b5555555-5555-4555-8555-555555555555';
  v_cutoff timestamptz := timestamptz '2026-11-07 05:11:00+00';
  v_after timestamptz := timestamptz '2026-11-07 05:12:00+00';
  v_before timestamptz := timestamptz '2026-11-07 05:10:00+00';
  v_activated timestamptz;
  v_result jsonb;
  v_count integer;
BEGIN
  PERFORM pg_temp.seed_user(c_first, 'first.thankyou@example.com');
  PERFORM pg_temp.seed_user(c_repeat, 'repeat.thankyou@example.com');
  PERFORM pg_temp.seed_user(c_other, 'other.thankyou@example.com');
  PERFORM pg_temp.seed_user(c_optout, 'optout.thankyou@example.com');
  PERFORM pg_temp.seed_user(c_suppressed, 'suppressed.thankyou@example.com');

  UPDATE public.profiles
  SET marketing_email_opt_in = false
  WHERE id = c_optout;
  UPDATE public.profiles
  SET email_suppressed_at = v_after, email_suppressed_reason = 'bounce'
  WHERE id = c_suppressed;

  v_activated := public.purchase_thank_you_activate(v_cutoff);
  IF v_activated IS DISTINCT FROM v_cutoff THEN
    RAISE EXCEPTION 'activate should persist the cutoff';
  END IF;
  IF public.purchase_thank_you_activate(v_before) IS DISTINCT FROM v_cutoff THEN
    RAISE EXCEPTION 're-enable must not move the cutoff earlier';
  END IF;

  PERFORM grant_credits(c_other, 200, 'purchase', 'evt_other_200', '200 pack', 'cs_other_200');
  v_result := public.purchase_thank_you_prepare_send(
    c_other, 'cs_other_200', 'evt_other_200', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'not_first' THEN
    RAISE EXCEPTION '200 pack must not qualify: %', v_result;
  END IF;

  PERFORM grant_credits(c_other, 100, 'trial', NULL, 'trial');
  PERFORM grant_credits(c_other, 100, 'bonus', 'evt_bonus', 'bonus', 'cs_bonus');
  PERFORM grant_credits(c_other, 100, 'adjustment', NULL, 'adjustment');
  v_result := public.purchase_thank_you_prepare_send(
    c_other, 'cs_bonus', 'evt_bonus', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'not_first' THEN
    RAISE EXCEPTION 'non-purchase 100 must not qualify: %', v_result;
  END IF;

  PERFORM grant_credits(c_first, 100, 'purchase', 'evt_old', 'old 100', 'cs_old');
  v_result := public.purchase_thank_you_prepare_send(
    c_first, 'cs_old', 'evt_old', v_before, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'cutoff' THEN
    RAISE EXCEPTION 'pre-cutoff event must not claim: %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM public.purchase_thank_you_claims WHERE user_id = c_first;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'cutoff skip must not insert a claim';
  END IF;

  PERFORM grant_credits(c_repeat, 100, 'purchase', 'evt_first', 'first 100', 'cs_first');
  v_result := public.purchase_thank_you_prepare_send(
    c_repeat, 'cs_first', 'evt_first', v_after, v_after
  );
  IF v_result->>'action' IS DISTINCT FROM 'send' THEN
    RAISE EXCEPTION 'first exact 100 should send: %', v_result;
  END IF;
  v_result := public.purchase_thank_you_prepare_send(
    c_repeat, 'cs_first', 'evt_retry', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'in_flight' THEN
    RAISE EXCEPTION 'duplicate webhook should not send again: %', v_result;
  END IF;
  PERFORM grant_credits(c_repeat, 100, 'purchase', 'evt_second', 'second 100', 'cs_second');
  v_result := public.purchase_thank_you_prepare_send(
    c_repeat, 'cs_second', 'evt_second', v_after + interval '1 minute', v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'not_first' THEN
    RAISE EXCEPTION 'second purchase must not send: %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM public.purchase_thank_you_claims WHERE user_id = c_repeat;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'lifetime dedupe expected 1 claim, got %', v_count;
  END IF;

  PERFORM grant_credits(c_optout, 100, 'purchase', 'evt_opt', 'opt out 100', 'cs_opt');
  v_result := public.purchase_thank_you_prepare_send(
    c_optout, 'cs_opt', 'evt_opt', v_after, v_after
  );
  IF v_result->>'action' IS DISTINCT FROM 'send' THEN
    RAISE EXCEPTION 'opt-out false is still eligible: %', v_result;
  END IF;

  PERFORM grant_credits(c_suppressed, 100, 'purchase', 'evt_sup', 'suppressed 100', 'cs_sup');
  v_result := public.purchase_thank_you_prepare_send(
    c_suppressed, 'cs_sup', 'evt_sup', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'suppressed' THEN
    RAISE EXCEPTION 'bounce must suppress: %', v_result;
  END IF;

  UPDATE public.purchase_thank_you_claims
  SET first_attempt_at = v_after - interval '24 hours',
      sending_at = v_after - interval '24 hours',
      status = 'sending',
      attempts = 1
  WHERE user_id = c_optout;
  v_result := public.purchase_thank_you_prepare_send(
    c_optout, 'cs_opt', 'evt_opt', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'ambiguous' THEN
    RAISE EXCEPTION 'expired uncertain send must not resend: %', v_result;
  END IF;

  PERFORM public.purchase_thank_you_activate(v_after + interval '1 day');
  SELECT activated_at INTO v_activated
  FROM public.purchase_thank_you_settings
  WHERE id = 1;
  IF v_activated IS DISTINCT FROM v_cutoff THEN
    RAISE EXCEPTION 'stored cutoff moved, got %', v_activated;
  END IF;
END;
$$;

ROLLBACK;

\echo 'PASS purchase-thank-you claims'
