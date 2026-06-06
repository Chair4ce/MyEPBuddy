-- Migration 157: Enable Supabase Realtime for user_credits
--
-- Migration 156 set REPLICA IDENTITY FULL on user_credits but never added the
-- table to the `supabase_realtime` publication. Without publication membership,
-- balance UPDATEs (from consume_credit / grant_credits) are never broadcast, so
-- the client credit counter never updates live. This adds it idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_credits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;
  END IF;
END $$;

-- Ensure the full row image is published so UPDATE payloads include `balance`.
ALTER TABLE public.user_credits REPLICA IDENTITY FULL;
