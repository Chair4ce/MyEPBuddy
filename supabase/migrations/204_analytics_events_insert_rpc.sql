-- Analytics inserts must not depend on the service_role key in the app process.
-- Migration 202 revoked authenticated INSERT on analytics_events; /api/analytics
-- then used createAdminClient(). In production that fails with 42501 whenever
-- SUPABASE_SERVICE_ROLE_KEY is missing, stale, or not a JWT with BYPASSRLS.
--
-- Fix: SECURITY DEFINER RPC callable by authenticated + anon. Forces
-- user_id = auth.uid() so clients cannot spoof another user's identity.
-- Table INSERT policies stay closed; only this function writes rows.

CREATE OR REPLACE FUNCTION public.insert_analytics_event(
  p_event_name text,
  p_session_id text,
  p_properties jsonb DEFAULT '{}'::jsonb,
  p_page_path text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_screen_width integer DEFAULT NULL,
  p_screen_height integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_name IS NULL OR btrim(p_event_name) = '' THEN
    RAISE EXCEPTION 'event_name is required';
  END IF;
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'session_id is required';
  END IF;

  INSERT INTO public.analytics_events (
    user_id,
    session_id,
    event_name,
    properties,
    page_path,
    referrer,
    user_agent,
    screen_width,
    screen_height
  ) VALUES (
    auth.uid(), -- never trust a caller-supplied user_id
    btrim(p_session_id),
    btrim(p_event_name),
    COALESCE(p_properties, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_page_path, '')), ''),
    NULLIF(btrim(COALESCE(p_referrer, '')), ''),
    NULLIF(btrim(COALESCE(p_user_agent, '')), ''),
    p_screen_width,
    p_screen_height
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_analytics_event(
  text, text, jsonb, text, text, text, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_analytics_event(
  text, text, jsonb, text, text, text, integer, integer
) TO anon, authenticated;

COMMENT ON FUNCTION public.insert_analytics_event IS
  'Insert analytics_events row with user_id = auth.uid(). Used by POST /api/analytics; table INSERT RLS stays closed.';
