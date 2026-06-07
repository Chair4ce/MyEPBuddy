-- Admin: aggregated token usage for the default (free, app-hosted) API key.
--
-- Default-key usage spans ALL users, so per-user RLS cannot surface it. This
-- SECURITY DEFINER function aggregates entirely in SQL (no row export) and is
-- guarded so only admins may call it. It returns a single JSONB document with
-- windowed totals, all-time totals, and breakdowns by model, feature, day, and
-- top users — enough for an admin to monitor free-key cost and spot abuse.

CREATE OR REPLACE FUNCTION admin_default_key_token_usage(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER := GREATEST(COALESCE(p_days, 30), 1);
  v_since TIMESTAMPTZ := now() - make_interval(days => v_days);
  v_result JSONB;
BEGIN
  -- Authorization: admins only.
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT jsonb_build_object(
    'since', v_since,
    'days', v_days,
    'totals', (
      SELECT jsonb_build_object(
        'calls', COUNT(*),
        'input_tokens', COALESCE(SUM(input_tokens), 0),
        'output_tokens', COALESCE(SUM(output_tokens), 0),
        'cached_input_tokens', COALESCE(SUM(cached_input_tokens), 0),
        'reasoning_tokens', COALESCE(SUM(reasoning_tokens), 0),
        'estimated_cost_usd', COALESCE(SUM(estimated_cost_usd), 0)
      )
      FROM llm_token_usage
      WHERE used_default_key = true AND created_at >= v_since
    ),
    'all_time', (
      SELECT jsonb_build_object(
        'calls', COUNT(*),
        'input_tokens', COALESCE(SUM(input_tokens), 0),
        'output_tokens', COALESCE(SUM(output_tokens), 0),
        'estimated_cost_usd', COALESCE(SUM(estimated_cost_usd), 0)
      )
      FROM llm_token_usage
      WHERE used_default_key = true
    ),
    'by_model', (
      SELECT COALESCE(jsonb_agg(m ORDER BY m.estimated_cost_usd DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(model_id, 'unknown') AS model_id,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
        FROM llm_token_usage
        WHERE used_default_key = true AND created_at >= v_since
        GROUP BY COALESCE(model_id, 'unknown')
      ) m
    ),
    'by_action', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.calls DESC), '[]'::jsonb)
      FROM (
        SELECT
          action_type,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
        FROM llm_token_usage
        WHERE used_default_key = true AND created_at >= v_since
        GROUP BY action_type
      ) a
    ),
    'by_day', (
      SELECT COALESCE(jsonb_agg(d ORDER BY d.day DESC), '[]'::jsonb)
      FROM (
        SELECT
          date_trunc('day', created_at)::date AS day,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
        FROM llm_token_usage
        WHERE used_default_key = true AND created_at >= v_since
        GROUP BY 1
      ) d
    ),
    'top_users', (
      SELECT COALESCE(jsonb_agg(u ORDER BY u.estimated_cost_usd DESC), '[]'::jsonb)
      FROM (
        SELECT
          t.user_id,
          p.email,
          p.full_name,
          COUNT(*) AS calls,
          COALESCE(SUM(t.input_tokens), 0) AS input_tokens,
          COALESCE(SUM(t.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(t.estimated_cost_usd), 0) AS estimated_cost_usd
        FROM llm_token_usage t
        JOIN profiles p ON p.id = t.user_id
        WHERE t.used_default_key = true AND t.created_at >= v_since
        GROUP BY t.user_id, p.email, p.full_name
        ORDER BY estimated_cost_usd DESC
        LIMIT 25
      ) u
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Lock down execution: only authenticated callers may invoke it, and the body
-- itself rejects non-admins.
REVOKE ALL ON FUNCTION admin_default_key_token_usage(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_default_key_token_usage(INTEGER) TO authenticated;

COMMENT ON FUNCTION admin_default_key_token_usage(INTEGER) IS 'Admin-only. Aggregated token usage for the default (free, app-hosted) API key over the last p_days. Returns JSONB with totals, all-time, by_model, by_action, by_day, and top_users.';
