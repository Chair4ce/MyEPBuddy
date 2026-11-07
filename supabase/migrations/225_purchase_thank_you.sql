-- One personal thank-you per buyer after the first paid 100-token grant.
-- The feature stays off until the app is live and calls activate with a cutoff.
-- Deploying this migration does not insert claims and does not send mail.

CREATE TABLE public.purchase_thank_you_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  activated_at timestamptz
);

INSERT INTO public.purchase_thank_you_settings (id, activated_at)
VALUES (1, NULL);

CREATE TABLE public.purchase_thank_you_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL,
  stripe_event_id text NOT NULL,
  event_created_at timestamptz NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  sending_at timestamptz,
  sent_at timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_thank_you_claims_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'suppressed', 'failed', 'ambiguous')),
  CONSTRAINT purchase_thank_you_claims_attempts_check
    CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX purchase_thank_you_claims_retry_idx
  ON public.purchase_thank_you_claims (status, first_attempt_at);

ALTER TABLE public.purchase_thank_you_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_thank_you_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_thank_you_settings_no_client
  ON public.purchase_thank_you_settings
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY purchase_thank_you_claims_no_client
  ON public.purchase_thank_you_claims
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.purchase_thank_you_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_thank_you_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_thank_you_settings TO service_role;
GRANT ALL ON TABLE public.purchase_thank_you_claims TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_thank_you_assert_service()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
  THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Persists the first cutoff and never moves it earlier than a later call.
CREATE OR REPLACE FUNCTION public.purchase_thank_you_activate(p_enabled_at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stored timestamptz;
BEGIN
  PERFORM public.purchase_thank_you_assert_service();
  IF p_enabled_at IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.purchase_thank_you_settings
  SET activated_at = COALESCE(activated_at, p_enabled_at)
  WHERE id = 1
  RETURNING activated_at INTO v_stored;

  IF v_stored IS NULL THEN
    RETURN p_enabled_at;
  END IF;
  IF v_stored >= p_enabled_at THEN
    RETURN v_stored;
  END IF;
  RETURN p_enabled_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_thank_you_prepare_send(
  p_user_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_event_id text,
  p_event_created timestamptz,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff timestamptz;
  v_first text;
  v_email text;
  v_suppressed boolean;
  v_claim public.purchase_thank_you_claims%ROWTYPE;
  v_action text;
BEGIN
  PERFORM public.purchase_thank_you_assert_service();
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT activated_at INTO v_cutoff
  FROM public.purchase_thank_you_settings
  WHERE id = 1;

  IF v_cutoff IS NULL OR p_event_created IS NULL OR p_event_created < v_cutoff THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', 'cutoff');
  END IF;

  SELECT ct.stripe_checkout_session_id INTO v_first
  FROM public.credit_transactions ct
  WHERE ct.user_id = p_user_id
    AND ct.type = 'purchase'
    AND ct.amount = 100
    AND ct.stripe_checkout_session_id IS NOT NULL
  ORDER BY ct.created_at ASC, ct.id ASC
  LIMIT 1;

  IF v_first IS NULL OR v_first IS DISTINCT FROM p_stripe_checkout_session_id THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', 'not_first');
  END IF;

  SELECT p.email, (p.email_suppressed_at IS NOT NULL)
  INTO v_email, v_suppressed
  FROM public.profiles p
  WHERE p.id = p_user_id;

  INSERT INTO public.purchase_thank_you_claims (
    user_id,
    stripe_checkout_session_id,
    stripe_event_id,
    event_created_at,
    status,
    last_error
  ) VALUES (
    p_user_id,
    p_stripe_checkout_session_id,
    p_stripe_event_id,
    p_event_created,
    CASE
      WHEN v_suppressed THEN 'suppressed'
      WHEN v_email IS NULL OR position('@' in v_email) = 0 THEN 'failed'
      ELSE 'pending'
    END,
    CASE
      WHEN v_suppressed THEN 'email_suppressed'
      WHEN v_email IS NULL OR position('@' in v_email) = 0 THEN 'no_email'
      ELSE NULL
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_claim
  FROM public.purchase_thank_you_claims
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', 'missing');
  END IF;

  IF v_claim.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', 'already');
  END IF;

  IF v_claim.status IN ('sent', 'suppressed', 'ambiguous')
     OR v_claim.resend_email_id IS NOT NULL
     OR v_claim.last_error = 'no_email' THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', v_claim.status);
  END IF;

  IF v_claim.first_attempt_at IS NOT NULL
     AND p_now > v_claim.first_attempt_at + interval '23 hours' THEN
    UPDATE public.purchase_thank_you_claims
    SET status = 'ambiguous', updated_at = p_now
    WHERE id = v_claim.id;
    RETURN jsonb_build_object('action', 'skip', 'reason', 'ambiguous');
  END IF;

  IF v_claim.status <> 'pending' AND v_claim.attempts >= 5 THEN
    UPDATE public.purchase_thank_you_claims
    SET status = 'ambiguous', updated_at = p_now
    WHERE id = v_claim.id;
    RETURN jsonb_build_object('action', 'skip', 'reason', 'ambiguous');
  END IF;

  IF v_claim.status = 'sending'
     AND v_claim.sending_at IS NOT NULL
     AND p_now < v_claim.sending_at + interval '5 minutes' THEN
    RETURN jsonb_build_object('action', 'skip', 'reason', 'in_flight');
  END IF;

  v_action := 'send';
  UPDATE public.purchase_thank_you_claims
  SET status = 'sending',
      attempts = attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, p_now),
      sending_at = p_now,
      updated_at = p_now
  WHERE id = v_claim.id
  RETURNING * INTO v_claim;

  RETURN jsonb_build_object(
    'action', v_action,
    'claim_id', v_claim.id,
    'to', v_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_thank_you_mark(
  p_claim_id uuid,
  p_status text,
  p_resend_email_id text,
  p_error text,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.purchase_thank_you_assert_service();
  IF p_status IS NULL OR p_status NOT IN ('sent', 'sending', 'suppressed') THEN
    RAISE EXCEPTION 'invalid thank-you status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.purchase_thank_you_claims
  SET status = CASE
        WHEN status IN ('sent', 'suppressed', 'ambiguous') THEN status
        ELSE p_status
      END,
      resend_email_id = CASE
        WHEN p_status = 'sent' AND resend_email_id IS NULL THEN p_resend_email_id
        ELSE resend_email_id
      END,
      sent_at = CASE
        WHEN p_status = 'sent' AND sent_at IS NULL THEN p_now
        ELSE sent_at
      END,
      last_error = COALESCE(p_error, last_error),
      updated_at = p_now
  WHERE id = p_claim_id
    AND status NOT IN ('sent', 'suppressed', 'ambiguous');
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_thank_you_expire(p_now timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.purchase_thank_you_assert_service();
  UPDATE public.purchase_thank_you_claims
  SET status = 'ambiguous', updated_at = p_now
  WHERE resend_email_id IS NULL
    AND status IN ('pending', 'sending', 'failed')
    AND first_attempt_at IS NOT NULL
    AND first_attempt_at < p_now - interval '23 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_thank_you_retry_candidates(p_now timestamptz)
RETURNS TABLE (
  user_id uuid,
  stripe_event_id text,
  stripe_checkout_session_id text,
  event_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.purchase_thank_you_assert_service();
  RETURN QUERY
  SELECT c.user_id, c.stripe_event_id, c.stripe_checkout_session_id, c.event_created_at
  FROM public.purchase_thank_you_claims c
  WHERE c.status IN ('pending', 'sending', 'failed')
    AND c.resend_email_id IS NULL
    AND c.last_error IS DISTINCT FROM 'no_email'
    AND (
      c.first_attempt_at IS NULL
      OR c.first_attempt_at >= p_now - interval '23 hours'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_thank_you_assert_service() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.purchase_thank_you_activate(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_thank_you_activate(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_thank_you_prepare_send(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_thank_you_prepare_send(uuid, text, text, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_thank_you_mark(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_thank_you_mark(uuid, text, text, text, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_thank_you_expire(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_thank_you_expire(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_thank_you_retry_candidates(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_thank_you_retry_candidates(timestamptz) TO service_role;

COMMENT ON TABLE public.purchase_thank_you_claims IS
  'One lifetime thank-you per buyer. Rows are created only for a first paid 100-token purchase at or after activation. No historical backfill.';
