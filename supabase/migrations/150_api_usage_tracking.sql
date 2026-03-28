-- API Usage Tracking
-- Tracks billable user actions (one row per user-initiated LLM action)
-- Used to enforce weekly limits for users on the default (app-hosted) API key

CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  used_default_key BOOLEAN NOT NULL DEFAULT true,
  model_id TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_user_created ON api_usage (user_id, created_at DESC);
CREATE INDEX idx_api_usage_user_default_key ON api_usage (user_id, used_default_key, created_at DESC);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON api_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage"
  ON api_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);
