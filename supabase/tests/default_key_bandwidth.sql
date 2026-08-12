-- Integration checks for default-key bandwidth inside consume_credit.
-- Run against local MyEPBuddy Postgres (54322). Wrapped in a transaction that
-- always rolls back so seed data is left untouched.
--
-- Invoked by: src/lib/__tests__/default-key-bandwidth.integration.test.ts

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_user_a CONSTANT UUID := '55555555-5555-5555-5555-555555555555';
  c_user_b CONSTANT UUID := '99999999-9999-9999-9999-999999999999';
  v_prev_rpm INT;
  v_result INT;
  v_i INT;
  v_ok_count INT := 0;
  v_balance INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = c_user_a) THEN
    RAISE EXCEPTION 'missing seed profile %', c_user_a;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = c_user_b) THEN
    RAISE EXCEPTION 'missing seed profile %', c_user_b;
  END IF;

  SELECT default_key_rpm INTO v_prev_rpm FROM epb_config WHERE id = 1;

  -- Isolate this transaction from leftover api_usage fair-share noise.
  DELETE FROM api_usage
  WHERE user_id IN (c_user_a, c_user_b)
    AND created_at >= now() - INTERVAL '60 seconds';

  -- Top up via grant_credits (requires auth.uid() NULL) so ledger stays valid.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM grant_credits(
    c_user_a,
    40,
    'adjustment',
    NULL,
    'bandwidth integration test top-up'
  );

  SELECT balance INTO v_balance FROM user_credits WHERE user_id = c_user_a;
  IF COALESCE(v_balance, 0) < 20 THEN
    RAISE EXCEPTION 'expected user A balance >= 20 after top-up, got %', v_balance;
  END IF;

  --------------------------------------------------------------------------
  -- 1) Empty bucket denies (return -1) even with credits
  --------------------------------------------------------------------------
  UPDATE epb_config SET default_key_rpm = 60 WHERE id = 1;
  UPDATE default_key_bandwidth
  SET tokens = 0, updated_at = now()
  WHERE id = 1;

  PERFORM set_config('request.jwt.claim.sub', c_user_a::text, true);

  v_result := consume_credit(
    c_user_a,
    'assess_accomplishment',
    'gemini-2.5-flash-lite',
    'google',
    'bandwidth-test-empty-' || gen_random_uuid()::text
  );

  IF v_result <> -1 THEN
    RAISE EXCEPTION 'empty bucket: expected -1, got %', v_result;
  END IF;

  --------------------------------------------------------------------------
  -- 2) Refill after idle restores tokens (updated_at 60s ago, tokens=0)
  --------------------------------------------------------------------------
  UPDATE default_key_bandwidth
  SET tokens = 0, updated_at = now() - INTERVAL '60 seconds'
  WHERE id = 1;

  v_result := consume_credit(
    c_user_a,
    'assess_accomplishment',
    'gemini-2.5-flash-lite',
    'google',
    'bandwidth-test-refill-' || gen_random_uuid()::text
  );

  IF v_result < 0 THEN
    RAISE EXCEPTION 'refill after idle: expected credit consume success, got %', v_result;
  END IF;

  --------------------------------------------------------------------------
  -- 3) Alone user can exceed the old rigid 5/60 burst
  --------------------------------------------------------------------------
  UPDATE epb_config SET default_key_rpm = 20 WHERE id = 1;
  UPDATE default_key_bandwidth
  SET tokens = 20, updated_at = now()
  WHERE id = 1;

  DELETE FROM api_usage
  WHERE user_id = c_user_a
    AND created_at >= now() - INTERVAL '60 seconds';

  v_ok_count := 0;
  FOR v_i IN 1..6 LOOP
    v_result := consume_credit(
      c_user_a,
      'assess_accomplishment',
      'gemini-2.5-flash-lite',
      'google',
      'bandwidth-test-alone-' || v_i::text || '-' || gen_random_uuid()::text
    );
    IF v_result < 0 THEN
      RAISE EXCEPTION 'alone burst: call % failed with % (old 5-cap should not apply)', v_i, v_result;
    END IF;
    v_ok_count := v_ok_count + 1;
  END LOOP;

  IF v_ok_count <> 6 THEN
    RAISE EXCEPTION 'alone burst: expected 6 successes, got %', v_ok_count;
  END IF;

  --------------------------------------------------------------------------
  -- 4) Fair share denies when another user is active and share is exhausted
  --------------------------------------------------------------------------
  UPDATE epb_config SET default_key_rpm = 10 WHERE id = 1;
  UPDATE default_key_bandwidth
  SET tokens = 10, updated_at = now()
  WHERE id = 1;

  DELETE FROM api_usage
  WHERE user_id IN (c_user_a, c_user_b)
    AND created_at >= now() - INTERVAL '60 seconds';

  -- User B activity makes active_users = 2 → fair_cap = ceil(10/2) = 5
  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (c_user_b, 'assess_accomplishment', true, 'gemini-2.5-flash-lite', 'google');

  -- User A already used their fair share (5) in the window
  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  SELECT
    c_user_a,
    'assess_accomplishment',
    true,
    'gemini-2.5-flash-lite',
    'google'
  FROM generate_series(1, 5);

  PERFORM set_config('request.jwt.claim.sub', c_user_a::text, true);

  v_result := consume_credit(
    c_user_a,
    'assess_accomplishment',
    'gemini-2.5-flash-lite',
    'google',
    'bandwidth-test-fair-' || gen_random_uuid()::text
  );

  IF v_result <> -1 THEN
    RAISE EXCEPTION 'fair share: expected -1 after exhausting share, got %', v_result;
  END IF;

  UPDATE epb_config SET default_key_rpm = COALESCE(v_prev_rpm, 60) WHERE id = 1;

  RAISE NOTICE 'PASS default-key bandwidth: empty deny, refill, alone>5, fair-share deny';
END $$;

ROLLBACK;

-- Visible on stdout for the Vitest harness (NOTICEs go to stderr).
SELECT 'PASS default-key bandwidth: empty deny, refill, alone>5, fair-share deny' AS status;
