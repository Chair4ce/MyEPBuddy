-- Analytics inserts must go through /api/analytics (service_role).
-- Drop the open authenticated INSERT policy so clients cannot spoof user_id
-- or spam the table via PostgREST.

DROP POLICY IF EXISTS "Users can insert own events" ON public.analytics_events;

-- No INSERT policy for authenticated/anon — service_role bypasses RLS.
COMMENT ON TABLE public.analytics_events IS
  'Self-hosted user behavior analytics. Inserts only via service_role (API route); no third-party data sharing.';
