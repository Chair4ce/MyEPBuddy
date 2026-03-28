-- Fix award_system_prompt: replace outdated 4-category headings with correct 2-category 1206 headings.
-- The old prompt from migration 037 referenced EXECUTING THE MISSION / LEADING PEOPLE / IMPROVING THE UNIT / MANAGING RESOURCES
-- which are EPB categories, NOT award categories. The correct AF Form 1206 headings are:
--   PERFORMANCE IN PRIMARY DUTY
--   WHOLE AIRMAN CONCEPT

-- Update existing rows that still contain the old 4-heading prompt (users who never customized)
UPDATE user_llm_settings
SET award_system_prompt = DEFAULT
WHERE award_system_prompt LIKE '%EXECUTING THE MISSION%'
  AND award_system_prompt LIKE '%LEADING PEOPLE%'
  AND award_system_prompt LIKE '%IMPROVING THE UNIT%'
  AND award_system_prompt LIKE '%MANAGING RESOURCES%';

-- Update the column default so new rows get the correct prompt
ALTER TABLE user_llm_settings
ALTER COLUMN award_system_prompt SET DEFAULT '';
