-- Admin: trial credit burn, conversion funnel, and BYOK model usage analytics.
--
-- Complements admin_default_key_token_usage (token/cost for the free app key) with
-- per-user credit consumption, conversion segments, burn-rate distributions, and
-- non-free-model call counts. SECURITY DEFINER + admin gate; returns aggregates only.

CREATE OR REPLACE FUNCTION admin_user_credit_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER := GREATEST(COALESCE(p_days, 30), 1);
  v_since TIMESTAMPTZ := now() - make_interval(days => v_days);
  v_trial_credits CONSTANT INTEGER := 100;
  v_free_model CONSTANT TEXT := 'gemini-2.5-flash-lite';
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT jsonb_build_object(
    'since', v_since,
    'days', v_days,
    'trial_credits', v_trial_credits,
    'population', (
      SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM profiles WHERE role != 'admin'),
        'with_credits_row', (SELECT COUNT(*) FROM user_credits),
        'active_in_window', (
          SELECT COUNT(DISTINCT user_id)
          FROM api_usage
          WHERE created_at >= v_since
        ),
        'default_key_active_in_window', (
          SELECT COUNT(DISTINCT user_id)
          FROM api_usage
          WHERE used_default_key = true AND created_at >= v_since
        )
      )
    ),
    'conversion', (
      WITH user_segments AS (
        SELECT
          p.id AS user_id,
          COALESCE(uc.lifetime_consumed, 0) AS lifetime_consumed,
          COALESCE(uc.lifetime_purchased, 0) AS lifetime_purchased,
          COALESCE(uc.balance, 0) AS balance,
          COALESCE(uc.trial_granted, false) AS trial_granted,
          (
            k.openai_key IS NOT NULL
            OR k.anthropic_key IS NOT NULL
            OR k.google_key IS NOT NULL
            OR k.grok_key IS NOT NULL
          ) AS has_byok,
          LEAST(v_trial_credits, COALESCE(uc.lifetime_consumed, 0)) AS trial_consumed
        FROM profiles p
        LEFT JOIN user_credits uc ON uc.user_id = p.id
        LEFT JOIN user_api_keys k ON k.user_id = p.id
        WHERE p.role != 'admin'
      )
      SELECT jsonb_build_object(
        'purchased_credits', COUNT(*) FILTER (WHERE lifetime_purchased > 0),
        'byok_users', COUNT(*) FILTER (WHERE has_byok),
        'byok_only', COUNT(*) FILTER (WHERE has_byok AND lifetime_purchased = 0),
        'byok_and_purchased', COUNT(*) FILTER (WHERE has_byok AND lifetime_purchased > 0),
        'trial_only_active', COUNT(*) FILTER (
          WHERE lifetime_consumed > 0
            AND lifetime_purchased = 0
            AND NOT has_byok
        ),
        'credits_first_byok', COUNT(*) FILTER (
          WHERE has_byok
            AND lifetime_consumed > 0
            AND EXISTS (
              SELECT 1 FROM api_usage a
              WHERE a.user_id = user_segments.user_id
                AND a.used_default_key = true
            )
        ),
        'dormant', COUNT(*) FILTER (WHERE lifetime_consumed = 0),
        'exhausted_no_convert', COUNT(*) FILTER (
          WHERE balance = 0
            AND lifetime_purchased = 0
            AND NOT has_byok
            AND lifetime_consumed > 0
        ),
        'consumed_any', COUNT(*) FILTER (WHERE lifetime_consumed > 0),
        'rates', (
          SELECT jsonb_build_object(
            'purchase_rate_pct', CASE
              WHEN COUNT(*) FILTER (WHERE lifetime_consumed > 0) = 0 THEN 0
              ELSE ROUND(
                100.0 * COUNT(*) FILTER (WHERE lifetime_purchased > 0)
                / COUNT(*) FILTER (WHERE lifetime_consumed > 0),
                1
              )
            END,
            'byok_rate_pct', CASE
              WHEN COUNT(*) FILTER (WHERE lifetime_consumed > 0) = 0 THEN 0
              ELSE ROUND(
                100.0 * COUNT(*) FILTER (WHERE has_byok)
                / COUNT(*) FILTER (WHERE lifetime_consumed > 0),
                1
              )
            END,
            'any_convert_pct', CASE
              WHEN COUNT(*) FILTER (WHERE lifetime_consumed > 0) = 0 THEN 0
              ELSE ROUND(
                100.0 * COUNT(*) FILTER (
                  WHERE lifetime_purchased > 0 OR has_byok
                ) / COUNT(*) FILTER (WHERE lifetime_consumed > 0),
                1
              )
            END,
            'exhausted_no_convert_pct', CASE
              WHEN COUNT(*) FILTER (WHERE lifetime_consumed > 0) = 0 THEN 0
              ELSE ROUND(
                100.0 * COUNT(*) FILTER (
                  WHERE balance = 0
                    AND lifetime_purchased = 0
                    AND NOT has_byok
                    AND lifetime_consumed > 0
                ) / COUNT(*) FILTER (WHERE lifetime_consumed > 0),
                1
              )
            END
          )
          FROM user_segments
        )
      )
      FROM user_segments
    ),
    'trial_burn', (
      WITH per_user AS (
        SELECT
          p.id AS user_id,
          p.created_at AS signed_up_at,
          COALESCE(uc.lifetime_consumed, 0) AS lifetime_consumed,
          COALESCE(uc.lifetime_purchased, 0) AS lifetime_purchased,
          COALESCE(uc.balance, 0) AS balance,
          LEAST(v_trial_credits, COALESCE(uc.lifetime_consumed, 0)) AS trial_consumed,
          GREATEST(
            1,
            EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0
          ) AS days_since_signup,
          (
            k.openai_key IS NOT NULL
            OR k.anthropic_key IS NOT NULL
            OR k.google_key IS NOT NULL
            OR k.grok_key IS NOT NULL
          ) AS has_byok
        FROM profiles p
        LEFT JOIN user_credits uc ON uc.user_id = p.id
        LEFT JOIN user_api_keys k ON k.user_id = p.id
        WHERE p.role != 'admin'
      ),
      window_calls AS (
        SELECT
          user_id,
          COUNT(*) AS calls_in_window
        FROM api_usage
        WHERE used_default_key = true
          AND created_at >= v_since
        GROUP BY user_id
      )
      SELECT jsonb_build_object(
        'avg_trial_consumed', COALESCE(ROUND(AVG(trial_consumed)::numeric, 1), 0),
        'avg_calls_per_week', COALESCE(ROUND(
          AVG(
            COALESCE(wc.calls_in_window, 0)::numeric / (v_days::numeric / 7.0)
          )::numeric,
          1
        ), 0),
        'avg_days_to_exhaust_trial', (
          SELECT COALESCE(ROUND(AVG(days_to_exhaust)::numeric, 1), 0)
          FROM (
            SELECT
              EXTRACT(EPOCH FROM (
                MAX(a.created_at) - pu.signed_up_at
              )) / 86400.0 AS days_to_exhaust
            FROM per_user pu
            JOIN api_usage a ON a.user_id = pu.user_id AND a.used_default_key = true
            WHERE pu.trial_consumed >= v_trial_credits
            GROUP BY pu.user_id, pu.signed_up_at
          ) exhausted
        ),
        'distribution', (
          SELECT COALESCE(jsonb_agg(d ORDER BY d.sort_order), '[]'::jsonb)
          FROM (
            SELECT bucket, users, sort_order
            FROM (
              SELECT 'unused' AS bucket, 0 AS sort_order,
                COUNT(*) FILTER (WHERE trial_consumed = 0) AS users
              FROM per_user
              UNION ALL
              SELECT '1-25', 1, COUNT(*) FILTER (WHERE trial_consumed BETWEEN 1 AND 25)
              FROM per_user
              UNION ALL
              SELECT '26-50', 2, COUNT(*) FILTER (WHERE trial_consumed BETWEEN 26 AND 50)
              FROM per_user
              UNION ALL
              SELECT '51-75', 3, COUNT(*) FILTER (WHERE trial_consumed BETWEEN 51 AND 75)
              FROM per_user
              UNION ALL
              SELECT '76-99', 4, COUNT(*) FILTER (WHERE trial_consumed BETWEEN 76 AND 99)
              FROM per_user
              UNION ALL
              SELECT 'exhausted (100)', 5, COUNT(*) FILTER (WHERE trial_consumed >= v_trial_credits)
              FROM per_user
            ) buckets
          ) d
        ),
        'by_week', (
          SELECT COALESCE(jsonb_agg(w ORDER BY w.week_start DESC), '[]'::jsonb)
          FROM (
            SELECT
              date_trunc('week', created_at)::date AS week_start,
              COUNT(*) AS calls,
              COUNT(DISTINCT user_id) AS unique_users
            FROM api_usage
            WHERE used_default_key = true
              AND created_at >= v_since
            GROUP BY 1
          ) w
        ),
        'by_day', (
          SELECT COALESCE(jsonb_agg(d ORDER BY d.day DESC), '[]'::jsonb)
          FROM (
            SELECT
              date_trunc('day', created_at)::date AS day,
              COUNT(*) AS calls,
              COUNT(DISTINCT user_id) AS unique_users
            FROM api_usage
            WHERE used_default_key = true
              AND created_at >= v_since
            GROUP BY 1
          ) d
        )
      )
      FROM per_user pu
      LEFT JOIN window_calls wc ON wc.user_id = pu.user_id
    ),
    'byok_models', (
      SELECT jsonb_build_object(
        'by_model', (
          SELECT COALESCE(jsonb_agg(m ORDER BY m.calls DESC), '[]'::jsonb)
          FROM (
            SELECT
              COALESCE(model_id, 'unknown') AS model_id,
              COUNT(*) AS calls,
              COUNT(DISTINCT user_id) AS unique_users
            FROM api_usage
            WHERE used_default_key = false
              AND COALESCE(model_id, '') != v_free_model
              AND created_at >= v_since
            GROUP BY COALESCE(model_id, 'unknown')
          ) m
        ),
        'by_category', (
          SELECT COALESCE(jsonb_agg(c ORDER BY c.calls DESC), '[]'::jsonb)
          FROM (
            SELECT
              CASE
                WHEN action_type IN (
                  'generate', 'revise_selection', 'generate_war',
                  'generate_slot_statement', 'parse_bulk_statements',
                  'adapt_sentence', 'synonyms', 'combine',
                  'combine_statements', 'convert_sentences', 'feedback_apply'
                ) THEN 'generate'
                WHEN action_type IN (
                  'assess_epb', 'assess_accomplishment', 'assess_accomplishment_preview'
                ) THEN 'assess'
                WHEN action_type = 'generate_award' THEN 'award'
                WHEN action_type = 'generate_decoration' THEN 'decoration'
                ELSE 'other'
              END AS category,
              COUNT(*) AS calls,
              COUNT(DISTINCT user_id) AS unique_users
            FROM api_usage
            WHERE used_default_key = false
              AND COALESCE(model_id, '') != v_free_model
              AND created_at >= v_since
            GROUP BY 1
          ) c
        ),
        'by_model_and_category', (
          SELECT COALESCE(jsonb_agg(mc ORDER BY mc.calls DESC), '[]'::jsonb)
          FROM (
            SELECT
              COALESCE(model_id, 'unknown') AS model_id,
              CASE
                WHEN action_type IN (
                  'generate', 'revise_selection', 'generate_war',
                  'generate_slot_statement', 'parse_bulk_statements',
                  'adapt_sentence', 'synonyms', 'combine',
                  'combine_statements', 'convert_sentences', 'feedback_apply'
                ) THEN 'generate'
                WHEN action_type IN (
                  'assess_epb', 'assess_accomplishment', 'assess_accomplishment_preview'
                ) THEN 'assess'
                WHEN action_type = 'generate_award' THEN 'award'
                WHEN action_type = 'generate_decoration' THEN 'decoration'
                ELSE 'other'
              END AS category,
              COUNT(*) AS calls
            FROM api_usage
            WHERE used_default_key = false
              AND COALESCE(model_id, '') != v_free_model
              AND created_at >= v_since
            GROUP BY 1, 2
          ) mc
        )
      )
    ),
    'trial_users', (
      SELECT COALESCE(jsonb_agg(u ORDER BY u.trial_consumed DESC, u.calls_per_week DESC), '[]'::jsonb)
      FROM (
        SELECT
          p.id AS user_id,
          p.email,
          p.full_name,
          p.created_at AS signed_up_at,
          LEAST(v_trial_credits, COALESCE(uc.lifetime_consumed, 0)) AS trial_consumed,
          COALESCE(uc.balance, 0) AS balance,
          COALESCE(uc.lifetime_purchased, 0) AS lifetime_purchased,
          COALESCE(uc.lifetime_consumed, 0) AS lifetime_consumed,
          (
            k.openai_key IS NOT NULL
            OR k.anthropic_key IS NOT NULL
            OR k.google_key IS NOT NULL
            OR k.grok_key IS NOT NULL
          ) AS has_byok,
          COALESCE(wc.calls_in_window, 0) AS calls_in_window,
          ROUND(
            COALESCE(wc.calls_in_window, 0)::numeric / (v_days::numeric / 7.0),
            1
          ) AS calls_per_week,
          CASE
            WHEN COALESCE(uc.lifetime_purchased, 0) > 0 THEN 'purchased'
            WHEN (
              k.openai_key IS NOT NULL
              OR k.anthropic_key IS NOT NULL
              OR k.google_key IS NOT NULL
              OR k.grok_key IS NOT NULL
            ) THEN 'byok'
            WHEN COALESCE(uc.balance, 0) = 0
              AND COALESCE(uc.lifetime_consumed, 0) > 0 THEN 'exhausted'
            WHEN COALESCE(uc.lifetime_consumed, 0) > 0 THEN 'trial_active'
            ELSE 'dormant'
          END AS segment
        FROM profiles p
        LEFT JOIN user_credits uc ON uc.user_id = p.id
        LEFT JOIN user_api_keys k ON k.user_id = p.id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS calls_in_window
          FROM api_usage
          WHERE used_default_key = true AND created_at >= v_since
          GROUP BY user_id
        ) wc ON wc.user_id = p.id
        WHERE p.role != 'admin'
          AND COALESCE(uc.lifetime_consumed, 0) > 0
        LIMIT 50
      ) u
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION admin_user_credit_analytics(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_user_credit_analytics(INTEGER) TO authenticated;

COMMENT ON FUNCTION admin_user_credit_analytics(INTEGER) IS 'Admin-only. Trial credit burn, conversion funnel, BYOK model usage, and per-user trial consumption over the last p_days.';
