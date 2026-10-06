-- Account inactivity lifecycle (notices, soft suspension, deletion).
--
-- Timeline, measured from the activity anchor:
--   day 305  notice_60
--   day 335  notice_30, and at least 30 days after notice_60 was sent
--   day 365  soft suspend, and at least 60 days after notice_60
--            and 30 days after notice_30
--   day 395  delete, and at least 30 days after suspension
--
-- A late notice never shortens those gaps. Each email stores the
-- suspension timestamp it actually stated.
--
-- Activity is the latest of auth.users.last_sign_in_at (or created_at
-- when the account has never signed in), auth.sessions updated_at /
-- refreshed_at, and profiles.inactivity_activity_at (set when a
-- suspended account signs back in, because the auth timestamp can lag
-- that request).
--
-- The notice row survives account deletion (ON DELETE SET NULL) so the
-- weekly deletion cap still has something to count. CASCADE would erase
-- the only record of a deletion in the same statement that needs it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactivity_suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivity_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inactivity_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_suppressed_reason text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_email_suppressed_reason_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_suppressed_reason_check
  CHECK (
    (
      email_suppressed_at IS NULL
      AND email_suppressed_reason IS NULL
    )
    OR (
      email_suppressed_at IS NOT NULL
      AND email_suppressed_reason IN ('bounce', 'complaint')
    )
  );

COMMENT ON COLUMN public.profiles.inactivity_suspended_at IS
  'Set when the inactivity job soft-suspends the account. Cleared on the next authenticated request.';

COMMENT ON COLUMN public.profiles.inactivity_exempt IS
  'When true, the inactivity job never emails, suspends, or deletes this account. Admins are set true.';

COMMENT ON COLUMN public.profiles.inactivity_activity_at IS
  'Service-role activity stamp. Included in the inactivity anchor so a restore cannot be immediately re-suspended.';

COMMENT ON COLUMN public.profiles.email_suppressed_at IS
  'Set from a Resend permanent bounce or complaint. Transactional inactivity mail is not sent to this address.';

COMMENT ON COLUMN public.profiles.email_suppressed_reason IS
  'bounce or complaint. Distinct from marketing_email_opt_in, which inactivity mail ignores.';

-- Existing administrators stay out of the job. Future promotions are
-- covered by trg_exempt_admins_from_inactivity.
UPDATE public.profiles
SET inactivity_exempt = true
WHERE role = 'admin'
  AND inactivity_exempt IS NOT TRUE;

CREATE TABLE IF NOT EXISTS public.account_inactivity_notices (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notice_type text NOT NULL,
  activity_anchor timestamptz NOT NULL,
  scheduled_suspend_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  resend_email_id text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  error text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT account_inactivity_notices_type_check
    CHECK (notice_type IN ('notice_60', 'notice_30', 'suspended', 'deleted')),
  CONSTRAINT account_inactivity_notices_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'dry_run')),
  CONSTRAINT account_inactivity_notices_attempts_check
    CHECK (attempts >= 0 AND attempts <= 10),
  CONSTRAINT account_inactivity_notices_cancel_reason_check
    CHECK (
      cancel_reason IS NULL
      OR cancel_reason IN ('activity', 'exempt', 'manual')
    )
);

-- One live notice per user, type, and inactivity cycle. Dropped rows
-- (cancelled or the user deleted) must not block a later cycle, so the
-- unique index ignores cancelled rows and rows whose user is gone.
CREATE UNIQUE INDEX IF NOT EXISTS account_inactivity_notices_cycle_key
  ON public.account_inactivity_notices (user_id, notice_type, activity_anchor)
  WHERE user_id IS NOT NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS account_inactivity_notices_sent_idx
  ON public.account_inactivity_notices (notice_type, sent_at)
  WHERE status = 'sent';

COMMENT ON TABLE public.account_inactivity_notices IS
  'Service-role record of inactivity notices. Dry runs do not insert. One open row per user, type, and activity anchor.';

ALTER TABLE public.account_inactivity_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_inactivity_notices_no_client
  ON public.account_inactivity_notices;

CREATE POLICY account_inactivity_notices_no_client
  ON public.account_inactivity_notices
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.account_inactivity_notices FROM PUBLIC;
REVOKE ALL ON TABLE public.account_inactivity_notices FROM anon;
REVOKE ALL ON TABLE public.account_inactivity_notices FROM authenticated;
GRANT ALL ON TABLE public.account_inactivity_notices TO service_role;

-- Pool-safe run lock. Session advisory locks are not safe on the
-- Supabase connection pooler; a single-row compare-and-set is.
CREATE TABLE IF NOT EXISTS public.inactivity_cron_lock (
  id boolean PRIMARY KEY DEFAULT true,
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT inactivity_cron_lock_singleton CHECK (id)
);

INSERT INTO public.inactivity_cron_lock (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.inactivity_cron_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inactivity_cron_lock_no_client
  ON public.inactivity_cron_lock;

CREATE POLICY inactivity_cron_lock_no_client
  ON public.inactivity_cron_lock
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.inactivity_cron_lock FROM PUBLIC;
REVOKE ALL ON TABLE public.inactivity_cron_lock FROM anon;
REVOKE ALL ON TABLE public.inactivity_cron_lock FROM authenticated;
GRANT ALL ON TABLE public.inactivity_cron_lock TO service_role;

-- Block self-service edits of the inactivity and suppression columns.
-- Same caller rules as protect_profiles_role: service_role JWT, or a
-- postgres / supabase_admin session. Never current_user (this function
-- is SECURITY DEFINER, so current_user is the owner).
CREATE OR REPLACE FUNCTION public.protect_profiles_inactivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.inactivity_suspended_at IS NOT DISTINCT FROM OLD.inactivity_suspended_at
     AND NEW.inactivity_exempt IS NOT DISTINCT FROM OLD.inactivity_exempt
     AND NEW.inactivity_activity_at IS NOT DISTINCT FROM OLD.inactivity_activity_at
     AND NEW.email_suppressed_at IS NOT DISTINCT FROM OLD.email_suppressed_at
     AND NEW.email_suppressed_reason IS NOT DISTINCT FROM OLD.email_suppressed_reason
  THEN
    RETURN NEW;
  END IF;

  IF auth.role() IS NOT NULL THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Changing inactivity or email-suppression fields is not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Changing inactivity or email-suppression fields is not permitted'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_inactivity ON public.profiles;

CREATE TRIGGER trg_protect_profiles_inactivity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_inactivity();

COMMENT ON FUNCTION public.protect_profiles_inactivity() IS
  'Blocks authenticated changes to inactivity and email-suppression columns.';

CREATE OR REPLACE FUNCTION public.exempt_admins_from_inactivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role::text = 'admin'
     AND (TG_OP = 'INSERT' OR OLD.role::text IS DISTINCT FROM 'admin')
  THEN
    NEW.inactivity_exempt := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exempt_admins_from_inactivity ON public.profiles;

CREATE TRIGGER trg_exempt_admins_from_inactivity
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.exempt_admins_from_inactivity();

COMMENT ON FUNCTION public.exempt_admins_from_inactivity() IS
  'Sets inactivity_exempt when a profile becomes an administrator.';

-- Shared caller gate for the job functions below.
CREATE OR REPLACE FUNCTION public.inactivity_assert_service()
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

-- Eligible people plus the activity anchor. Internal. Not granted.
CREATE OR REPLACE FUNCTION public.inactivity_user_activity(p_now timestamptz)
RETURNS TABLE (
  user_id uuid,
  email text,
  activity_at timestamptz,
  inactivity_suspended_at timestamptz,
  inactivity_exempt boolean,
  is_admin boolean,
  email_suppressed boolean,
  email_confirmed boolean,
  is_banned boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    u.id,
    u.email::text,
    GREATEST(
      COALESCE(u.last_sign_in_at, u.created_at),
      COALESCE(sess.session_at, '-infinity'::timestamptz),
      COALESCE(p.inactivity_activity_at, '-infinity'::timestamptz)
    ) AS activity_at,
    p.inactivity_suspended_at,
    p.inactivity_exempt,
    (p.role::text = 'admin') AS is_admin,
    (p.email_suppressed_at IS NOT NULL) AS email_suppressed,
    (
      u.email_confirmed_at IS NOT NULL
      AND NULLIF(pg_catalog.btrim(u.email::text), '') IS NOT NULL
    ) AS email_confirmed,
    (u.banned_until IS NOT NULL AND u.banned_until > p_now) AS is_banned
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN LATERAL (
    SELECT MAX(
      GREATEST(
        s.updated_at::timestamptz,
        COALESCE(s.refreshed_at::timestamptz, s.updated_at::timestamptz)
      )
    ) AS session_at
    FROM auth.sessions s
    WHERE s.user_id = u.id
  ) sess ON true;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_due(
  p_now timestamptz,
  p_limit integer,
  p_stage text
)
RETURNS TABLE (
  user_id uuid,
  email text,
  activity_at timestamptz,
  due_stage text,
  scheduled_suspend_at timestamptz,
  scheduled_delete_at timestamptz,
  notice_60_sent_at timestamptz,
  notice_30_sent_at timestamptz,
  already_suspended boolean,
  email_suppressed boolean,
  suspended_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.inactivity_assert_service();

  IF p_now IS NULL THEN
    RAISE EXCEPTION 'p_now is required' USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  IF p_stage NOT IN ('notice_60', 'notice_30', 'suspended', 'deleted') THEN
    RAISE EXCEPTION 'invalid stage' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT *
    FROM public.inactivity_user_activity(p_now) a
    WHERE a.is_admin = false
      AND a.inactivity_exempt = false
      AND a.email_confirmed = true
      AND a.is_banned = false
  ),
  with_notices AS (
    SELECT
      pe.*,
      n60.sent_at AS n60_sent_at,
      n60.status AS n60_status,
      n60.attempts AS n60_attempts,
      n30.sent_at AS n30_sent_at,
      n30.status AS n30_status,
      n30.attempts AS n30_attempts,
      ns.status AS ns_status,
      ns.attempts AS ns_attempts,
      nd.status AS nd_status,
      nd.attempts AS nd_attempts
    FROM people pe
    LEFT JOIN public.account_inactivity_notices n60
      ON n60.user_id = pe.user_id
     AND n60.notice_type = 'notice_60'
     AND n60.activity_anchor = pe.activity_at
     AND n60.cancelled_at IS NULL
    LEFT JOIN public.account_inactivity_notices n30
      ON n30.user_id = pe.user_id
     AND n30.notice_type = 'notice_30'
     AND n30.activity_anchor = pe.activity_at
     AND n30.cancelled_at IS NULL
    LEFT JOIN public.account_inactivity_notices ns
      ON ns.user_id = pe.user_id
     AND ns.notice_type = 'suspended'
     AND ns.activity_anchor = pe.activity_at
     AND ns.cancelled_at IS NULL
    LEFT JOIN public.account_inactivity_notices nd
      ON nd.user_id = pe.user_id
     AND nd.notice_type = 'deleted'
     AND nd.activity_anchor = pe.activity_at
     AND nd.cancelled_at IS NULL
  ),
  due AS (
    SELECT
      w.user_id,
      w.email,
      w.activity_at,
      p_stage AS due_stage,
      CASE
        WHEN p_stage = 'notice_60' THEN GREATEST(
          w.activity_at + interval '365 days',
          p_now + interval '60 days'
        )
        WHEN p_stage = 'notice_30' THEN GREATEST(
          w.activity_at + interval '365 days',
          w.n60_sent_at + interval '60 days',
          p_now + interval '30 days'
        )
        WHEN p_stage IN ('suspended', 'deleted') THEN GREATEST(
          w.activity_at + interval '365 days',
          w.n60_sent_at + interval '60 days',
          w.n30_sent_at + interval '30 days'
        )
        ELSE NULL
      END AS scheduled_suspend_at,
      w.n60_sent_at,
      w.n30_sent_at,
      (w.inactivity_suspended_at IS NOT NULL) AS already_suspended,
      w.email_suppressed,
      w.inactivity_suspended_at
    FROM with_notices w
    WHERE CASE p_stage
      WHEN 'notice_60' THEN
        w.inactivity_suspended_at IS NULL
        AND w.email_suppressed = false
        AND w.activity_at <= p_now - interval '305 days'
        AND w.n60_status IS DISTINCT FROM 'sent'
        AND w.n60_status IS DISTINCT FROM 'skipped'
        AND COALESCE(w.n60_attempts, 0) < 3
      WHEN 'notice_30' THEN
        w.inactivity_suspended_at IS NULL
        AND w.email_suppressed = false
        AND w.n60_status = 'sent'
        AND w.n60_sent_at IS NOT NULL
        AND p_now >= GREATEST(
          w.activity_at + interval '335 days',
          w.n60_sent_at + interval '30 days'
        )
        AND w.n30_status IS DISTINCT FROM 'sent'
        AND w.n30_status IS DISTINCT FROM 'skipped'
        AND COALESCE(w.n30_attempts, 0) < 3
      WHEN 'suspended' THEN
        w.n60_status = 'sent'
        AND w.n30_status = 'sent'
        AND w.n60_sent_at IS NOT NULL
        AND w.n30_sent_at IS NOT NULL
        AND p_now >= GREATEST(
          w.activity_at + interval '365 days',
          w.n60_sent_at + interval '60 days',
          w.n30_sent_at + interval '30 days'
        )
        AND w.ns_status IS DISTINCT FROM 'sent'
        AND w.ns_status IS DISTINCT FROM 'skipped'
        AND COALESCE(w.ns_attempts, 0) < 3
        AND (
          w.inactivity_suspended_at IS NULL
          OR w.email_suppressed = false
        )
      WHEN 'deleted' THEN
        w.inactivity_suspended_at IS NOT NULL
        AND p_now >= GREATEST(
          w.activity_at + interval '395 days',
          w.inactivity_suspended_at + interval '30 days'
        )
        AND w.nd_status IS DISTINCT FROM 'sent'
        AND COALESCE(w.nd_attempts, 0) < 3
      ELSE false
    END
  )
  SELECT
    d.user_id,
    d.email,
    d.activity_at,
    d.due_stage,
    d.scheduled_suspend_at,
    CASE
      WHEN p_stage = 'deleted' THEN GREATEST(
        d.activity_at + interval '395 days',
        d.inactivity_suspended_at + interval '30 days'
      )
      ELSE d.scheduled_suspend_at + interval '30 days'
    END AS scheduled_delete_at,
    d.n60_sent_at,
    d.n30_sent_at,
    d.already_suspended,
    d.email_suppressed,
    d.inactivity_suspended_at
  FROM due d
  ORDER BY d.activity_at ASC, d.user_id ASC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_cancel_stale(p_now timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  PERFORM public.inactivity_assert_service();

  IF p_now IS NULL THEN
    RAISE EXCEPTION 'p_now is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.account_inactivity_notices n
  SET
    cancelled_at = p_now,
    cancel_reason = CASE
      WHEN a.is_admin OR a.inactivity_exempt THEN 'exempt'
      ELSE 'activity'
    END
  FROM public.inactivity_user_activity(p_now) a
  WHERE n.user_id = a.user_id
    AND n.cancelled_at IS NULL
    AND n.notice_type <> 'deleted'
    AND (
      a.activity_at > n.activity_anchor
      OR a.is_admin
      OR a.inactivity_exempt
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.profiles p
  SET inactivity_suspended_at = NULL
  FROM public.inactivity_user_activity(p_now) a
  WHERE p.id = a.user_id
    AND p.inactivity_suspended_at IS NOT NULL
    AND (
      a.activity_at > p.inactivity_suspended_at
      OR a.is_admin
      OR a.inactivity_exempt
    );

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_cancel_user(
  p_user_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  PERFORM public.inactivity_assert_service();

  IF p_reason IS NULL OR p_reason NOT IN ('activity', 'exempt', 'manual') THEN
    RAISE EXCEPTION 'invalid cancel reason' USING ERRCODE = '22023';
  END IF;

  UPDATE public.account_inactivity_notices
  SET cancelled_at = pg_catalog.now(),
      cancel_reason = p_reason
  WHERE user_id = p_user_id
    AND cancelled_at IS NULL
    AND notice_type <> 'deleted';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.profiles
  SET inactivity_suspended_at = NULL,
      inactivity_activity_at = pg_catalog.now()
  WHERE id = p_user_id;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_claim_notice(
  p_user_id uuid,
  p_notice_type text,
  p_activity_anchor timestamptz,
  p_scheduled_suspend_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.inactivity_assert_service();

  IF p_notice_type NOT IN ('notice_60', 'notice_30', 'suspended', 'deleted') THEN
    RAISE EXCEPTION 'invalid notice type' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.account_inactivity_notices (
    user_id,
    notice_type,
    activity_anchor,
    scheduled_suspend_at,
    status,
    attempts
  )
  VALUES (
    p_user_id,
    p_notice_type,
    p_activity_anchor,
    p_scheduled_suspend_at,
    'pending',
    1
  )
  ON CONFLICT (user_id, notice_type, activity_anchor)
    WHERE user_id IS NOT NULL AND cancelled_at IS NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  UPDATE public.account_inactivity_notices
  SET attempts = attempts + 1,
      status = 'pending',
      error = NULL,
      scheduled_suspend_at = p_scheduled_suspend_at
  WHERE user_id = p_user_id
    AND notice_type = p_notice_type
    AND activity_anchor = p_activity_anchor
    AND cancelled_at IS NULL
    AND status IN ('pending', 'failed')
    AND attempts < 3
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_try_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id boolean;
BEGIN
  PERFORM public.inactivity_assert_service();

  UPDATE public.inactivity_cron_lock
  SET started_at = pg_catalog.now(),
      finished_at = NULL
  WHERE id IS TRUE
    AND (
      started_at IS NULL
      OR (finished_at IS NOT NULL AND finished_at >= started_at)
      OR started_at < pg_catalog.now() - interval '20 minutes'
    )
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inactivity_finish_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.inactivity_assert_service();

  UPDATE public.inactivity_cron_lock
  SET finished_at = pg_catalog.now()
  WHERE id IS TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.inactivity_assert_service() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_assert_service() FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_assert_service() FROM authenticated;
REVOKE ALL ON FUNCTION public.inactivity_assert_service() FROM service_role;

REVOKE ALL ON FUNCTION public.inactivity_user_activity(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_user_activity(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_user_activity(timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.inactivity_user_activity(timestamptz) FROM service_role;

-- Trigger functions are not RPCs. PostgreSQL still fires them for
-- profile writes after EXECUTE is revoked from client roles.
REVOKE ALL ON FUNCTION public.protect_profiles_inactivity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profiles_inactivity() FROM anon;
REVOKE ALL ON FUNCTION public.protect_profiles_inactivity() FROM authenticated;
REVOKE ALL ON FUNCTION public.protect_profiles_inactivity() FROM service_role;

REVOKE ALL ON FUNCTION public.exempt_admins_from_inactivity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exempt_admins_from_inactivity() FROM anon;
REVOKE ALL ON FUNCTION public.exempt_admins_from_inactivity() FROM authenticated;
REVOKE ALL ON FUNCTION public.exempt_admins_from_inactivity() FROM service_role;

REVOKE ALL ON FUNCTION public.inactivity_due(timestamptz, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_due(timestamptz, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_due(timestamptz, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_due(timestamptz, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.inactivity_cancel_stale(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_cancel_stale(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_cancel_stale(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_cancel_stale(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.inactivity_cancel_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_cancel_user(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_cancel_user(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_cancel_user(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.inactivity_claim_notice(uuid, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_claim_notice(uuid, text, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_claim_notice(uuid, text, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_claim_notice(uuid, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.inactivity_try_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_try_lock() FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_try_lock() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_try_lock() TO service_role;

REVOKE ALL ON FUNCTION public.inactivity_finish_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivity_finish_lock() FROM anon;
REVOKE ALL ON FUNCTION public.inactivity_finish_lock() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inactivity_finish_lock() TO service_role;
