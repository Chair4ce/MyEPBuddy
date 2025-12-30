-- Add abbreviations column to user_llm_settings
-- Abbreviations are word-to-short-form mappings that the LLM should automatically apply
ALTER TABLE user_llm_settings 
ADD COLUMN IF NOT EXISTS abbreviations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Example abbreviations structure:
-- [
--   {"word": "maintenance", "abbreviation": "maint"},
--   {"word": "equipment", "abbreviation": "equip"},
--   {"word": "operational", "abbreviation": "ops"}
-- ]





