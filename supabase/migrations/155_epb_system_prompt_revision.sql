-- Track which EPB system prompt revision the user has acknowledged.
-- When app EPB_SYSTEM_PROMPT_REVISION exceeds this value, show the update modal
-- or auto-migrate legacy/unmodified prompts on next login.
ALTER TABLE user_llm_settings
  ADD COLUMN IF NOT EXISTS epb_system_prompt_revision_acknowledged INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_llm_settings.epb_system_prompt_revision_acknowledged IS
  'Last EPB_SYSTEM_PROMPT_REVISION the user acknowledged. Bump app revision to re-prompt after default prompt updates.';
