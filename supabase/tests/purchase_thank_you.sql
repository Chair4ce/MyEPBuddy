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
  v_claim uuid;
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
    RAISE EXCEPTION 'pre-cutoff event must not send: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.purchase_thank_you_claims
  WHERE user_id = c_first AND status = 'ineligible';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'pre-cutoff purchase must be sealed';
  END IF;
  v_result := public.purchase_thank_you_prepare_send(
    c_first, 'cs_old', 'evt_old_later', v_after, v_after
  );
  IF v_result->>'action' IS DISTINCT FROM 'skip' THEN
    RAISE EXCEPTION 'later event for a pre-cutoff purchase must not send: %', v_result;
  END IF;

  PERFORM grant_credits(c_repeat, 100, 'purchase', 'evt_first', 'first 100', 'cs_first');
  v_result := public.purchase_thank_you_prepare_send(
    c_repeat, 'cs_first', 'evt_first', v_after, v_after
  );
  IF v_result->>'action' IS DISTINCT FROM 'send' THEN
    RAISE EXCEPTION 'first exact 100 should send: %', v_result;
  END IF;
  -- Same session, same transaction. This sees the uncommitted row.
  -- It does not prove a second connection. That case is
  -- purchase-thank-you.integration.test.ts.
  v_result := public.purchase_thank_you_prepare_send(
    c_repeat, 'cs_first', 'evt_retry', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'in_flight' THEN
    RAISE EXCEPTION 'duplicate webhook should not send again: %', v_result;
  END IF;
  SELECT id INTO v_claim
  FROM public.purchase_thank_you_claims
  WHERE user_id = c_repeat;
  IF NOT public.purchase_thank_you_note_dispatch(v_claim, v_after) THEN
    RAISE EXCEPTION 'first provider dispatch should open';
  END IF;
  UPDATE public.purchase_thank_you_claims
  SET first_attempt_at = v_after - interval '24 hours'
  WHERE id = v_claim;
  IF public.purchase_thank_you_note_dispatch(v_claim, v_after) THEN
    RAISE EXCEPTION 'dispatch after the idempotency window must not open';
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
  SET sending_at = v_after - interval '6 minutes'
  WHERE user_id = c_optout;
  UPDATE public.profiles
  SET email_suppressed_at = v_after, email_suppressed_reason = 'complaint'
  WHERE id = c_optout;
  v_result := public.purchase_thank_you_prepare_send(
    c_optout, 'cs_opt', 'evt_opt', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'suppressed' THEN
    RAISE EXCEPTION 'a later bounce must stop a reserved send: %', v_result;
  END IF;

  PERFORM grant_credits(c_other, 100, 'purchase', NULL, 'sessionless 100', NULL);
  PERFORM grant_credits(c_other, 100, 'purchase', 'evt_after_null', 'later 100', 'cs_after_null');
  v_result := public.purchase_thank_you_prepare_send(
    c_other, 'cs_after_null', 'evt_after_null', v_after, v_after
  );
  IF v_result->>'reason' IS DISTINCT FROM 'not_first' THEN
    RAISE EXCEPTION 'a sessionless 100 still counts as the first purchase: %', v_result;
  END IF;

  IF public.purchase_thank_you_activate(v_before) IS DISTINCT FROM v_cutoff THEN
    RAISE EXCEPTION 'earlier cutoff must not replace the stored cutoff';
  END IF;
  v_activated := public.purchase_thank_you_activate(v_after + interval '1 day');
  IF v_activated IS DISTINCT FROM v_after + interval '1 day' THEN
    RAISE EXCEPTION 'a later cutoff must narrow the stored cutoff, got %', v_activated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'purchase_thank_you%'
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'anon, authenticated, or public can execute a thank-you function';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'purchase_thank_you%'
      AND p.proname <> 'purchase_thank_you_assert_service'
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute a thank-you function';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.purchase_thank_you_assert_service()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role can call assert_service directly';
  END IF;

  IF has_table_privilege('anon', 'public.purchase_thank_you_claims', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.purchase_thank_you_claims', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.purchase_thank_you_settings', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.purchase_thank_you_settings', 'SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'anon or authenticated has a thank-you table privilege';
  END IF;

  IF NOT (
       has_table_privilege('service_role', 'public.purchase_thank_you_claims', 'SELECT')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_claims', 'INSERT')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_claims', 'UPDATE')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_claims', 'DELETE')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_settings', 'SELECT')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_settings', 'INSERT')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_settings', 'UPDATE')
       AND has_table_privilege('service_role', 'public.purchase_thank_you_settings', 'DELETE')
     )
  THEN
    RAISE EXCEPTION 'service_role is missing a thank-you table privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'purchase_thank_you%'
      AND (
        p.proconfig IS NULL
        OR NOT (p.proconfig @> ARRAY['search_path=""'])
      )
  ) THEN
    RAISE EXCEPTION 'a thank-you function has a mutable search_path';
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.purchase_thank_you_activate(v_cutoff);
    RAISE EXCEPTION 'anon executed purchase_thank_you_activate';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.purchase_thank_you_prepare_send(
      c_repeat, 'cs_first', 'evt_client', v_after, v_after
    );
    RAISE EXCEPTION 'authenticated executed purchase_thank_you_prepare_send';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.purchase_thank_you_note_dispatch(v_claim, v_after);
    RAISE EXCEPTION 'anon executed purchase_thank_you_note_dispatch';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.purchase_thank_you_mark(v_claim, 'sent', 'email_x', NULL, v_after);
    RAISE EXCEPTION 'authenticated executed purchase_thank_you_mark';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.purchase_thank_you_claims;
    RAISE EXCEPTION 'anon read claims';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1 FROM public.purchase_thank_you_settings;
    RAISE EXCEPTION 'authenticated read settings';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.purchase_thank_you_claims (
      user_id, stripe_checkout_session_id, stripe_event_id, event_created_at, status
    ) VALUES (
      c_repeat, 'cs_hack', 'evt_hack', v_after, 'pending'
    );
    RAISE EXCEPTION 'authenticated inserted a claim';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- API calls run as authenticator. An authenticated JWT must be rejected
  -- inside the function. A service_role JWT must be allowed.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    SET LOCAL SESSION AUTHORIZATION authenticator;
    SET LOCAL ROLE service_role;
    BEGIN
      PERFORM public.purchase_thank_you_expire(v_after);
      RAISE EXCEPTION 'authenticated jwt called purchase_thank_you_expire';
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF SQLERRM NOT ILIKE '%Access denied%' THEN
          RAISE;
        END IF;
    END;
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.purchase_thank_you_expire(v_after);
  END;
  RESET SESSION AUTHORIZATION;
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;

\echo 'PASS purchase-thank-you claims'
