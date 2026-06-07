-- Token Usage Tracking
-- Captures per-call LLM token consumption so BYOK (own-key) users can see
-- projected/estimated spend for the models they use.
--
-- Two parts:
--   1. Pricing columns on llm_model_catalog (manually maintained — provider
--      inference APIs do NOT expose live pricing, so these are curated
--      estimates in USD per million tokens).
--   2. A llm_token_usage table that records input/output/cached/reasoning
--      tokens plus a snapshot of the estimated cost at the time of the call.

-- 1. Pricing columns (USD per 1,000,000 tokens) -----------------------------
ALTER TABLE llm_model_catalog
  ADD COLUMN IF NOT EXISTS input_price_per_mtok NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS output_price_per_mtok NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS cached_input_price_per_mtok NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN llm_model_catalog.input_price_per_mtok IS 'Manually maintained estimate: USD per 1,000,000 input (prompt) tokens.';
COMMENT ON COLUMN llm_model_catalog.output_price_per_mtok IS 'Manually maintained estimate: USD per 1,000,000 output (completion) tokens.';
COMMENT ON COLUMN llm_model_catalog.cached_input_price_per_mtok IS 'Manually maintained estimate: USD per 1,000,000 cached input tokens (cache read). Falls back to input price when null.';

-- Seed curated pricing for the known models (USD / Mtok, as of mid-2026).
-- These are estimates for projection only — update as providers change rates.
UPDATE llm_model_catalog SET
  input_price_per_mtok = v.input_price,
  output_price_per_mtok = v.output_price,
  cached_input_price_per_mtok = v.cached_price,
  price_currency = 'usd',
  price_updated_at = now()
FROM (
  VALUES
    ('gpt-4o',                     2.50, 10.00, 1.25),
    ('gpt-4o-mini',                0.15,  0.60, 0.075),
    ('claude-sonnet-4-20250514',   3.00, 15.00, 0.30),
    ('claude-3-5-haiku-20241022',  0.80,  4.00, 0.08),
    ('gemini-2.5-flash-lite',      0.10,  0.40, 0.025),
    ('gemini-2.5-flash',           0.30,  2.50, 0.075),
    ('gemini-2.5-pro',             1.25, 10.00, 0.31),
    ('grok-3-mini',                0.30,  0.50, 0.075)
) AS v(model_id, input_price, output_price, cached_price)
WHERE llm_model_catalog.id = v.model_id;

-- 2. Per-call token usage ---------------------------------------------------
CREATE TABLE llm_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  model_id TEXT,
  provider TEXT,
  used_default_key BOOLEAN NOT NULL DEFAULT false,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_token_usage_user_created
  ON llm_token_usage (user_id, created_at DESC);

CREATE INDEX idx_llm_token_usage_user_key_created
  ON llm_token_usage (user_id, used_default_key, created_at DESC);

ALTER TABLE llm_token_usage ENABLE ROW LEVEL SECURITY;

-- Users may read only their own token usage. Inserts are performed exclusively
-- by the server using the service role (which bypasses RLS), so no INSERT
-- policy is exposed to clients — this prevents users from fabricating cost rows.
CREATE POLICY "Users can view their own token usage"
  ON llm_token_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE llm_token_usage IS 'Per-call LLM token consumption with a snapshot of estimated USD cost. Used to project BYOK spend. Inserted server-side via service role only.';
COMMENT ON COLUMN llm_token_usage.estimated_cost_usd IS 'Snapshot of estimated cost (USD) computed from catalog pricing at call time. Null when pricing was unavailable.';
