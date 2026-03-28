-- Fix: migration 146 used SET award_system_prompt = DEFAULT, but DEFAULT was
-- still the old prompt at that point. This migration explicitly clears the
-- stale 4-heading prompt so the app falls back to the correct code-side default
-- (PERFORMANCE IN PRIMARY DUTY / WHOLE AIRMAN CONCEPT).

UPDATE user_llm_settings
SET award_system_prompt = ''
WHERE award_system_prompt LIKE '%EXECUTING THE MISSION%'
  AND award_system_prompt LIKE '%LEADING PEOPLE%'
  AND award_system_prompt LIKE '%IMPROVING THE UNIT%'
  AND award_system_prompt LIKE '%MANAGING RESOURCES%';
