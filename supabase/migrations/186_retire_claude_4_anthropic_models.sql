-- Retire deprecated Anthropic models (Sonnet 4, Haiku 3.5) and add current BYOK replacements.
-- Anthropic retired claude-sonnet-4-20250514 and claude-3-5-haiku-20241022 in mid-2026.

UPDATE llm_model_catalog
SET
  is_active = false,
  deprecated_at = COALESCE(deprecated_at, now()),
  updated_at = now()
WHERE id IN (
  'claude-sonnet-4-20250514',
  'claude-3-5-haiku-20241022'
);

INSERT INTO llm_model_catalog (
  id, provider, display_name, description, quality, statement_tip,
  is_app_default, is_active, supports_default_key, sort_order,
  input_price_per_mtok, output_price_per_mtok, cached_input_price_per_mtok,
  price_currency, price_updated_at
) VALUES
  (
    'claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6',
    'Anthropic''s balanced model', 'excellent',
    'Top-tier for EPB statements. Strong at matching writing style, following instructions, and capturing impact.',
    false, true, true, 30,
    3.00, 15.00, 0.30,
    'usd', now()
  ),
  (
    'claude-haiku-4-5-20251001', 'anthropic', 'Claude Haiku 4.5',
    'Fast and efficient', 'good',
    'Fast with solid results. Good for quick drafts, though complex statements may need refinement.',
    false, true, true, 40,
    1.00, 5.00, 0.10,
    'usd', now()
  )
ON CONFLICT (id) DO UPDATE SET
  provider = EXCLUDED.provider,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  quality = EXCLUDED.quality,
  statement_tip = EXCLUDED.statement_tip,
  is_active = true,
  supports_default_key = EXCLUDED.supports_default_key,
  sort_order = EXCLUDED.sort_order,
  deprecated_at = NULL,
  input_price_per_mtok = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok = EXCLUDED.output_price_per_mtok,
  cached_input_price_per_mtok = EXCLUDED.cached_input_price_per_mtok,
  price_currency = EXCLUDED.price_currency,
  price_updated_at = EXCLUDED.price_updated_at,
  updated_at = now();

-- Remap saved default model picks.
UPDATE user_llm_settings u
SET model_preferences = jsonb_set(
  u.model_preferences,
  '{defaults}',
  COALESCE(
    (
      SELECT jsonb_object_agg(
        e.key,
        to_jsonb(
          CASE e.value #>> '{}'
            WHEN 'claude-sonnet-4-20250514' THEN 'claude-sonnet-4-6'
            WHEN 'claude-3-5-haiku-20241022' THEN 'claude-haiku-4-5-20251001'
            ELSE e.value #>> '{}'
          END
        )
      )
      FROM jsonb_each(u.model_preferences->'defaults') AS e
    ),
    '{}'::jsonb
  )
)
WHERE u.model_preferences::text LIKE '%claude-sonnet-4-20250514%'
   OR u.model_preferences::text LIKE '%claude-3-5-haiku-20241022%';

-- Remap visible model lists.
UPDATE user_llm_settings u
SET model_preferences = jsonb_set(
  u.model_preferences,
  '{visible_model_ids}',
  (
    SELECT jsonb_agg(
      to_jsonb(
        CASE elem
          WHEN 'claude-sonnet-4-20250514' THEN 'claude-sonnet-4-6'
          WHEN 'claude-3-5-haiku-20241022' THEN 'claude-haiku-4-5-20251001'
          ELSE elem
        END
      )
    )
    FROM jsonb_array_elements_text(u.model_preferences->'visible_model_ids') AS elem
  )
)
WHERE jsonb_typeof(u.model_preferences->'visible_model_ids') = 'array'
  AND (
    u.model_preferences::text LIKE '%claude-sonnet-4-20250514%'
    OR u.model_preferences::text LIKE '%claude-3-5-haiku-20241022%'
  );
