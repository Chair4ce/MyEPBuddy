-- Housekeeping protocols so append-only tables don't grow unbounded.
--
-- api_usage: only the last 60s matters for burst enforcement and ~30 days for
--   admin analytics. Prune rows older than the retention window (default 90d).
-- billable_request_cache: only useful for the retry window; prune after 48h.
--
-- credit_transactions is the event-sourcing source of truth and is NEVER pruned.
--
-- Jobs are scheduled via pg_cron when available (Supabase hosted). The prune
-- functions are also callable by service-role for an external scheduler
-- (e.g. a Vercel cron hitting an admin route) where pg_cron is not loaded.

CREATE OR REPLACE FUNCTION prune_api_usage(p_retention_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- Cron/service context only (no end-user JWT).
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: housekeeping is service-initiated only';
  END IF;

  DELETE FROM api_usage
  WHERE created_at < now() - make_interval(days => GREATEST(p_retention_days, 1));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION prune_billable_request_cache(p_retention_hours INT DEFAULT 48)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: housekeeping is service-initiated only';
  END IF;

  DELETE FROM billable_request_cache
  WHERE created_at < now() - make_interval(hours => GREATEST(p_retention_hours, 1));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION prune_api_usage(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_api_usage(INT) TO service_role;

REVOKE ALL ON FUNCTION prune_billable_request_cache(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_billable_request_cache(INT) TO service_role;

-- Schedule via pg_cron where it is preloaded (Supabase hosted). Local stacks
-- usually don't preload pg_cron, so tolerate failure and continue.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

      -- Daily at 03:00 / 03:15 UTC. cron.schedule upserts by job name.
      PERFORM cron.schedule(
        'prune-api-usage',
        '0 3 * * *',
        'SELECT public.prune_api_usage(90)'
      );
      PERFORM cron.schedule(
        'prune-billable-request-cache',
        '15 3 * * *',
        'SELECT public.prune_billable_request_cache(48)'
      );
      RAISE NOTICE 'pg_cron housekeeping jobs scheduled';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron not enabled (%); prune functions exist for external scheduling', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron unavailable; prune functions exist for external scheduling';
  END IF;
END
$$;
