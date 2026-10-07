-- Selection rules for the account-inactivity job.
-- Self-contained: seeds throwaway auth users, asserts, then rolls back.
--
-- Invoked by: src/lib/__tests__/account-inactivity.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.seed_user(
  p_id uuid,
  p_email text,
  p_created timestamptz,
  p_sign_in timestamptz,
  p_confirmed boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    last_sign_in_at
  )
  VALUES (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt('password123', gen_salt('bf')),
    CASE WHEN p_confirmed THEN p_created ELSE NULL END,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_email),
    p_created,
    p_created,
    '',
    '',
    p_sign_in
  );
END;
$$;

DO $$
DECLARE
  v_now CONSTANT timestamptz := timestamptz '2026-10-05 16:00:00+00';
  c_304 CONSTANT uuid := 'a304a304-a304-4304-a304-a304a304a304';
  c_305 CONSTANT uuid := 'a305a305-a305-4305-a305-a305a305a305';
  c_never CONSTANT uuid := 'a000a000-a000-4000-a000-a000a000a000';
  c_session CONSTANT uuid := 'a111a111-a111-4111-a111-a111a111a111';
  c_unconfirmed CONSTANT uuid := 'a222a222-a222-4222-a222-a222a222a222';
  c_admin CONSTANT uuid := 'a333a333-a333-4333-a333-a333a333a333';
  c_exempt CONSTANT uuid := 'a444a444-a444-4444-a444-a444a444a444';
  c_banned CONSTANT uuid := 'a555a555-a555-4555-a555-a555a555a555';
  c_suppressed CONSTANT uuid := 'a666a666-a666-4666-a666-a666a666a666';
  c_optout CONSTANT uuid := 'a777a777-a777-4777-a777-a777a777a777';
  c_30early CONSTANT uuid := 'a888a888-a888-4888-a888-a888a888a888';
  c_30due CONSTANT uuid := 'a999a999-a999-4999-a999-a999a999a999';
  c_suspend_early CONSTANT uuid := 'aaaaaaa1-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
  c_suspend_due CONSTANT uuid := 'aaaaaaa2-aaaa-4aaa-aaaa-aaaaaaaaaaa2';
  c_cancel CONSTANT uuid := 'aaaaaaa3-aaaa-4aaa-aaaa-aaaaaaaaaaa3';
  c_del29 CONSTANT uuid := 'aaaaaaa4-aaaa-4aaa-aaaa-aaaaaaaaaaa4';
  c_del30 CONSTANT uuid := 'aaaaaaa5-aaaa-4aaa-aaaa-aaaaaaaaaaa5';
  c_unconf_del CONSTANT uuid := 'aaaaaaa6-aaaa-4aaa-aaaa-aaaaaaaaaaa6';
  c_old CONSTANT uuid := 'aaaaaaa7-aaaa-4aaa-aaaa-aaaaaaaaaaa7';
  c_claim CONSTANT uuid := 'aaaaaaa8-aaaa-4aaa-aaaa-aaaaaaaaaaa8';
  c_delete_row CONSTANT uuid := 'aaaaaaa9-aaaa-4aaa-aaaa-aaaaaaaaaaa9';
  v_anchor timestamptz;
  v_suspend timestamptz;
  v_id uuid;
  v_attempts integer;
  v_count integer;
  v_due boolean;
  v_reason text;
  v_suspended timestamptz;
  v_user uuid;
  v_locked boolean;
BEGIN
  PERFORM pg_temp.seed_user(c_304, 'inact-304@example.com', v_now - interval '304 days', v_now - interval '304 days', true);
  PERFORM pg_temp.seed_user(c_305, 'inact-305@example.com', v_now - interval '305 days', v_now - interval '305 days', true);
  PERFORM pg_temp.seed_user(c_never, 'inact-never@example.com', v_now - interval '305 days', NULL, true);
  PERFORM pg_temp.seed_user(c_session, 'inact-session@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_unconfirmed, 'inact-unconfirmed@example.com', v_now - interval '400 days', v_now - interval '400 days', false);
  PERFORM pg_temp.seed_user(c_admin, 'inact-admin@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_exempt, 'inact-exempt@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_banned, 'inact-banned@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_suppressed, 'inact-suppressed@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_optout, 'inact-optout@example.com', v_now - interval '305 days', v_now - interval '305 days', true);
  PERFORM pg_temp.seed_user(c_30early, 'inact-30early@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_30due, 'inact-30due@example.com', v_now - interval '400 days', v_now - interval '400 days', true);
  PERFORM pg_temp.seed_user(c_suspend_early, 'inact-suspend-early@example.com', v_now - interval '500 days', v_now - interval '500 days', true);
  PERFORM pg_temp.seed_user(c_suspend_due, 'inact-suspend-due@example.com', v_now - interval '500 days', v_now - interval '500 days', true);
  PERFORM pg_temp.seed_user(c_cancel, 'inact-cancel@example.com', v_now - interval '305 days', v_now - interval '305 days', true);
  PERFORM pg_temp.seed_user(c_del29, 'inact-del29@example.com', v_now - interval '500 days', v_now - interval '500 days', true);
  PERFORM pg_temp.seed_user(c_del30, 'inact-del30@example.com', v_now - interval '500 days', v_now - interval '500 days', true);
  PERFORM pg_temp.seed_user(c_unconf_del, 'inact-unconf-del@example.com', v_now - interval '500 days', v_now - interval '500 days', false);
  PERFORM pg_temp.seed_user(c_old, 'inact-old@example.com', v_now - interval '600 days', v_now - interval '600 days', true);
  PERFORM pg_temp.seed_user(c_claim, 'inact-claim@example.com', v_now - interval '305 days', v_now - interval '305 days', true);
  PERFORM pg_temp.seed_user(c_delete_row, 'inact-delete-row@example.com', v_now - interval '500 days', v_now - interval '500 days', true);

  INSERT INTO auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
  VALUES (
    'b111b111-b111-4111-b111-b111b111b111',
    c_session,
    v_now - interval '1 day',
    v_now - interval '1 day',
    (v_now - interval '1 day')::timestamp
  );

  UPDATE public.profiles SET role = 'admin' WHERE id = c_admin;
  UPDATE public.profiles SET inactivity_exempt = true WHERE id = c_exempt;
  UPDATE auth.users SET banned_until = v_now + interval '1 day' WHERE id = c_banned;
  UPDATE public.profiles
  SET email_suppressed_at = v_now, email_suppressed_reason = 'bounce'
  WHERE id = c_suppressed;
  UPDATE public.profiles SET marketing_email_opt_in = false WHERE id = c_optout;
  UPDATE public.profiles
  SET inactivity_suspended_at = v_now - interval '29 days'
  WHERE id = c_del29;
  UPDATE public.profiles
  SET inactivity_suspended_at = v_now - interval '30 days'
  WHERE id = c_del30;
  UPDATE public.profiles
  SET inactivity_suspended_at = v_now - interval '40 days'
  WHERE id = c_unconf_del;
  UPDATE public.profiles
  SET inactivity_suspended_at = v_now - interval '5 days'
  WHERE id = c_cancel;

  SELECT activity_at INTO v_anchor
  FROM public.inactivity_user_activity(v_now)
  WHERE user_id = c_session;
  IF v_anchor IS DISTINCT FROM v_now - interval '1 day' THEN
    RAISE EXCEPTION 'session activity did not beat stale last_sign_in: %', v_anchor;
  END IF;

  SELECT activity_at INTO v_anchor
  FROM public.inactivity_user_activity(v_now)
  WHERE user_id = c_never;
  IF v_anchor IS DISTINCT FROM v_now - interval '305 days' THEN
    RAISE EXCEPTION 'never-signed-in anchor should be created_at, got %', v_anchor;
  END IF;

  SELECT inactivity_exempt INTO v_due FROM public.profiles WHERE id = c_admin;
  IF v_due IS NOT TRUE THEN
    RAISE EXCEPTION 'promoting to admin did not set inactivity_exempt';
  END IF;

  UPDATE public.profiles SET role = 'member' WHERE id = c_admin;
  SELECT inactivity_exempt INTO v_due FROM public.profiles WHERE id = c_admin;
  IF v_due IS NOT TRUE THEN
    RAISE EXCEPTION 'demotion cleared inactivity_exempt';
  END IF;

  -- 304 days is not due. 305 days is, including never-signed-in and marketing opt-out.
  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'notice_60') d WHERE d.user_id = c_304;
  IF FOUND THEN
    RAISE EXCEPTION '304-day account was selected';
  END IF;

  FOREACH v_user IN ARRAY ARRAY[c_305, c_never, c_optout, c_old] LOOP
    PERFORM 1 FROM public.inactivity_due(v_now, 100, 'notice_60') d WHERE d.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'expected notice_60 for %', v_user;
    END IF;
  END LOOP;

  FOREACH v_user IN ARRAY ARRAY[c_session, c_unconfirmed, c_admin, c_exempt, c_banned, c_suppressed, c_del30] LOOP
    PERFORM 1 FROM public.inactivity_due(v_now, 100, 'notice_60') d WHERE d.user_id = v_user;
    IF FOUND THEN
      RAISE EXCEPTION 'notice_60 should skip %', v_user;
    END IF;
  END LOOP;

  SELECT d.scheduled_suspend_at INTO v_suspend
  FROM public.inactivity_due(v_now, 100, 'notice_60') d
  WHERE d.user_id = c_305;
  IF v_suspend IS DISTINCT FROM v_now + interval '60 days' THEN
    RAISE EXCEPTION '60-day notice stated % instead of now+60', v_suspend;
  END IF;

  SELECT d.user_id INTO v_user
  FROM public.inactivity_due(v_now, 1, 'notice_60') d;
  IF v_user IS DISTINCT FROM c_old THEN
    RAISE EXCEPTION 'limit 1 should return the oldest anchor, got %', v_user;
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_30early;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts, sent_at
  ) VALUES (
    c_30early, 'notice_60', v_anchor, v_anchor + interval '365 days', 'sent', 1, v_now - interval '10 days'
  );

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_30due;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts, sent_at
  ) VALUES (
    c_30due, 'notice_60', v_anchor, v_now + interval '30 days', 'sent', 1, v_now - interval '30 days'
  );

  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'notice_30') d WHERE d.user_id = c_30early;
  IF FOUND THEN
    RAISE EXCEPTION '30-day notice fired before 30 days after the 60-day notice';
  END IF;

  SELECT d.scheduled_suspend_at INTO v_suspend
  FROM public.inactivity_due(v_now, 100, 'notice_30') d
  WHERE d.user_id = c_30due;
  IF v_suspend IS NULL THEN
    RAISE EXCEPTION '30-day notice was not due after a 30-day gap';
  END IF;
  IF v_suspend IS DISTINCT FROM v_now + interval '30 days' THEN
    RAISE EXCEPTION 'late 60-day notice shortened suspension to %', v_suspend;
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_suspend_early;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts, sent_at
  ) VALUES
    (c_suspend_early, 'notice_60', v_anchor, v_now + interval '20 days', 'sent', 1, v_now - interval '40 days'),
    (c_suspend_early, 'notice_30', v_anchor, v_now + interval '20 days', 'sent', 1, v_now - interval '10 days');

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_suspend_due;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts, sent_at
  ) VALUES
    (c_suspend_due, 'notice_60', v_anchor, v_now - interval '10 days', 'sent', 1, v_now - interval '70 days'),
    (c_suspend_due, 'notice_30', v_anchor, v_now - interval '10 days', 'sent', 1, v_now - interval '40 days');

  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'suspended') d WHERE d.user_id = c_suspend_early;
  IF FOUND THEN
    RAISE EXCEPTION 'suspension fired before both warning gaps elapsed';
  END IF;

  SELECT d.scheduled_suspend_at INTO v_suspend
  FROM public.inactivity_due(v_now, 100, 'suspended') d
  WHERE d.user_id = c_suspend_due;
  IF v_suspend IS DISTINCT FROM v_now - interval '10 days' THEN
    RAISE EXCEPTION 'suspension date % did not honor both notice gaps', v_suspend;
  END IF;

  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'deleted') d WHERE d.user_id = c_del29;
  IF FOUND THEN
    RAISE EXCEPTION 'deletion fired 29 days after suspension';
  END IF;

  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'deleted') d WHERE d.user_id = c_del30;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deletion was not due 30 days after suspension';
  END IF;

  PERFORM 1 FROM public.inactivity_due(v_now, 100, 'deleted') d WHERE d.user_id = c_unconf_del;
  IF FOUND THEN
    RAISE EXCEPTION 'unconfirmed account was selected for deletion';
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_cancel;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts
  ) VALUES (
    c_cancel, 'notice_60', v_anchor, v_now + interval '60 days', 'pending', 1
  );
  UPDATE auth.users SET last_sign_in_at = v_now WHERE id = c_cancel;
  PERFORM public.inactivity_cancel_stale(v_now);

  SELECT n.cancel_reason INTO v_reason
  FROM public.account_inactivity_notices n
  WHERE n.user_id = c_cancel AND n.cancelled_at IS NOT NULL;
  IF v_reason IS DISTINCT FROM 'activity' THEN
    RAISE EXCEPTION 'activity did not cancel the open notice, reason %', v_reason;
  END IF;

  SELECT inactivity_suspended_at INTO v_suspended FROM public.profiles WHERE id = c_cancel;
  IF v_suspended IS NOT NULL THEN
    RAISE EXCEPTION 'sign-in left the suspension in place';
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_exempt;
  INSERT INTO public.account_inactivity_notices (
    user_id, notice_type, activity_anchor, scheduled_suspend_at, status, attempts
  ) VALUES (
    c_exempt, 'notice_60', v_anchor, v_anchor + interval '365 days', 'sent', 1
  );
  PERFORM public.inactivity_cancel_stale(v_now);
  SELECT n.cancel_reason INTO v_reason
  FROM public.account_inactivity_notices n
  WHERE n.user_id = c_exempt AND n.cancelled_at IS NOT NULL;
  IF v_reason IS DISTINCT FROM 'exempt' THEN
    RAISE EXCEPTION 'exempt account was not cancelled, reason %', v_reason;
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_claim;
  v_id := public.inactivity_claim_notice(c_claim, 'notice_60', v_anchor, v_now + interval '60 days');
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'claim did not insert';
  END IF;
  UPDATE public.account_inactivity_notices SET status = 'sent', sent_at = v_now WHERE id = v_id;
  IF public.inactivity_claim_notice(c_claim, 'notice_60', v_anchor, v_now + interval '60 days') IS NOT NULL THEN
    RAISE EXCEPTION 'sent notice was claimed again';
  END IF;

  v_id := public.inactivity_claim_notice(c_claim, 'notice_30', v_anchor, v_now + interval '30 days');
  UPDATE public.account_inactivity_notices SET status = 'failed' WHERE id = v_id;
  v_id := public.inactivity_claim_notice(c_claim, 'notice_30', v_anchor, v_now + interval '30 days');
  SELECT attempts INTO v_attempts FROM public.account_inactivity_notices WHERE id = v_id;
  IF v_attempts IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'failed claim did not increment attempts, got %', v_attempts;
  END IF;
  UPDATE public.account_inactivity_notices SET status = 'failed' WHERE id = v_id;
  v_id := public.inactivity_claim_notice(c_claim, 'notice_30', v_anchor, v_now + interval '30 days');
  SELECT attempts INTO v_attempts FROM public.account_inactivity_notices WHERE id = v_id;
  IF v_attempts IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'third attempt was not recorded, got %', v_attempts;
  END IF;
  IF public.inactivity_claim_notice(c_claim, 'notice_30', v_anchor, v_now + interval '30 days') IS NOT NULL THEN
    RAISE EXCEPTION 'claim continued after 3 attempts';
  END IF;

  SELECT activity_at INTO v_anchor FROM public.inactivity_user_activity(v_now) WHERE user_id = c_delete_row;
  v_id := public.inactivity_claim_notice(c_delete_row, 'deleted', v_anchor, v_anchor + interval '365 days');
  DELETE FROM auth.users WHERE id = c_delete_row;
  SELECT count(*) INTO v_count
  FROM public.account_inactivity_notices
  WHERE id = v_id AND user_id IS NULL;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'deletion removed the notice row the weekly cap counts';
  END IF;

  IF public.inactivity_try_lock() IS NOT TRUE THEN
    RAISE EXCEPTION 'lock was not acquired';
  END IF;
  IF public.inactivity_try_lock() IS NOT FALSE THEN
    RAISE EXCEPTION 'second run acquired the lock';
  END IF;
  PERFORM public.inactivity_finish_lock();
  IF public.inactivity_try_lock() IS NOT TRUE THEN
    RAISE EXCEPTION 'lock did not release';
  END IF;

  -- API calls run as authenticator, not the table owner. An authenticated
  -- JWT must be rejected. A service_role JWT must be allowed.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    SET LOCAL SESSION AUTHORIZATION authenticator;
    SET LOCAL ROLE service_role;
    BEGIN
      PERFORM public.inactivity_due(v_now, 1, 'notice_60');
      RAISE EXCEPTION 'authenticated jwt called inactivity_due';
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF SQLERRM NOT ILIKE '%Access denied%' THEN
          RAISE;
        END IF;
    END;
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.inactivity_due(v_now, 1, 'notice_60');
  END;
  RESET SESSION AUTHORIZATION;
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Own-row profile edits still work. Inactivity columns do not.
  PERFORM set_config('request.jwt.claim.sub', c_305::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', c_305, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles SET full_name = 'Still Editable' WHERE id = c_305;
  BEGIN
    UPDATE public.profiles SET inactivity_exempt = true WHERE id = c_305;
    RAISE EXCEPTION 'member updated inactivity_exempt';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%inactivity%' THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT full_name INTO v_reason FROM public.profiles WHERE id = c_305;
  IF v_reason IS DISTINCT FROM 'Still Editable' THEN
    RAISE EXCEPTION 'ordinary profile update did not stick';
  END IF;
  SELECT inactivity_exempt INTO v_locked FROM public.profiles WHERE id = c_305;
  IF v_locked IS NOT FALSE THEN
    RAISE EXCEPTION 'inactivity_exempt changed';
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.inactivity_due(v_now, 1, 'notice_60');
    RAISE EXCEPTION 'anon executed inactivity_due';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.inactivity_claim_notice(c_305, 'notice_60', v_now, v_now);
    RAISE EXCEPTION 'authenticated executed inactivity_claim_notice';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.account_inactivity_notices;
    RAISE EXCEPTION 'anon read notices';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SET LOCAL ROLE service_role;
  PERFORM public.inactivity_due(v_now, 1, 'notice_60');
  RESET ROLE;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'inactivity%'
      AND (
        p.proconfig IS NULL
        OR NOT (p.proconfig @> ARRAY['search_path=""'])
      )
  ) THEN
    RAISE EXCEPTION 'an inactivity function has a mutable search_path';
  END IF;
END;
$$;

ROLLBACK;

\echo PASS account-inactivity selection
