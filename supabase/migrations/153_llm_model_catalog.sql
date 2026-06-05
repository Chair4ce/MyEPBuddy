-- Dynamic LLM model catalog (synced from provider APIs) and per-user picker preferences

CREATE TABLE llm_model_catalog (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'xai')),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quality TEXT NOT NULL DEFAULT 'good' CHECK (quality IN ('excellent', 'good', 'basic')),
  statement_tip TEXT NOT NULL DEFAULT '',
  is_app_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  supports_default_key BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_llm_model_catalog_single_default
  ON llm_model_catalog (is_app_default)
  WHERE is_app_default = true;

CREATE INDEX idx_llm_model_catalog_provider_active
  ON llm_model_catalog (provider, is_active);

ALTER TABLE llm_model_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model catalog"
  ON llm_model_catalog FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE user_llm_settings
  ADD COLUMN IF NOT EXISTS model_preferences JSONB NOT NULL DEFAULT '{"visible_model_ids": null, "defaults": {}}'::jsonb;

COMMENT ON TABLE llm_model_catalog IS 'App-wide LLM catalog synced from provider APIs. Deprecated models are marked inactive.';
COMMENT ON COLUMN llm_model_catalog.supports_default_key IS 'True when the app shared API key can call this model.';
COMMENT ON COLUMN user_llm_settings.model_preferences IS 'User model picker prefs: visible_model_ids (null=all available) and per-context defaults.';

-- Seed from the current curated list
INSERT INTO llm_model_catalog (
  id, provider, display_name, description, quality, statement_tip,
  is_app_default, supports_default_key, sort_order
) VALUES
  (
    'gpt-4o', 'openai', 'GPT-4o',
    'OpenAI''s most capable model', 'excellent',
    'Excellent at structured military writing. Produces polished, regulation-ready statements with minimal editing.',
    false, false, 10
  ),
  (
    'gpt-4o-mini', 'openai', 'GPT-4o Mini',
    'Fast and cost-effective', 'good',
    'Good output for most statements. May occasionally need light editing on tone or impact phrasing.',
    false, false, 20
  ),
  (
    'claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4',
    'Anthropic''s balanced model', 'excellent',
    'Top-tier for EPB statements. Strong at matching writing style, following instructions, and capturing impact.',
    false, false, 30
  ),
  (
    'claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku',
    'Fast and efficient', 'good',
    'Fast with solid results. Good for quick drafts, though complex statements may need refinement.',
    false, false, 40
  ),
  (
    'gemini-2.5-flash-lite', 'google', 'Gemini 2.5 Flash Lite',
    'Free default model', 'basic',
    'Basic quality — usable but statements often need editing. This is the free default when no API key is saved.',
    true, true, 50
  ),
  (
    'gemini-2.5-flash', 'google', 'Gemini 2.5 Flash',
    'Google''s balanced fast model', 'good',
    'Strong balance of speed and quality. Good upgrade over Flash Lite for polished statements.',
    false, false, 60
  ),
  (
    'gemini-2.5-pro', 'google', 'Gemini 2.5 Pro',
    'Google''s advanced model', 'good',
    'Solid upgrade over Flash. Produces more detailed and polished statements with better impact language.',
    false, false, 70
  ),
  (
    'grok-3-mini', 'xai', 'Grok 3 Mini',
    'xAI''s cost-effective model', 'good',
    'Capable model with good general performance. May occasionally use non-standard military phrasing.',
    false, false, 80
  )
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER update_llm_model_catalog_updated_at
  BEFORE UPDATE ON llm_model_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
