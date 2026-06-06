-- Admin-configurable feature flags for prompt editors vs. per-context rules CRUD

ALTER TABLE epb_config
  ADD COLUMN show_prompt_editors BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN enable_prompt_rules BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN epb_config.show_prompt_editors IS
  'When true, users can view and edit raw LLM system/style prompts. When false, prompt textareas are hidden.';

COMMENT ON COLUMN epb_config.enable_prompt_rules IS
  'When true, users manage per-context prompt rules and rules are injected at generation time.';
