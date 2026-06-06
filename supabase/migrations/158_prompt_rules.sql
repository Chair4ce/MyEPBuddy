-- Per-user, per-context LLM rules (append-only overrides at generation time)

CREATE TYPE prompt_rule_context AS ENUM (
  'epb',
  'award',
  'decoration',
  'assessment',
  'opb',
  'war',
  'duty_description'
);

CREATE TABLE user_prompt_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  context prompt_rule_context NOT NULL,
  rule_text TEXT NOT NULL CHECK (char_length(trim(rule_text)) > 0 AND char_length(rule_text) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_prompt_rules_user_context
  ON user_prompt_rules (user_id, context, sort_order);

CREATE INDEX idx_user_prompt_rules_user_context_active
  ON user_prompt_rules (user_id, context)
  WHERE is_active = true;

ALTER TABLE user_prompt_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prompt rules"
  ON user_prompt_rules FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own prompt rules"
  ON user_prompt_rules FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own prompt rules"
  ON user_prompt_rules FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own prompt rules"
  ON user_prompt_rules FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION update_user_prompt_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_prompt_rules_updated_at
  BEFORE UPDATE ON user_prompt_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_user_prompt_rules_updated_at();
