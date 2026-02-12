-- Add a decoration-specific abbreviations list to user_llm_settings.
-- Users can define which abbreviations are allowed in decoration citations
-- (e.g., "Command and Control" → "C2", "Department of Defense" → "DoD").
-- Default is an empty array — spell everything out unless the user opts in.

ALTER TABLE user_llm_settings
  ADD COLUMN IF NOT EXISTS decoration_abbreviations JSONB NOT NULL DEFAULT '[]'::jsonb;
