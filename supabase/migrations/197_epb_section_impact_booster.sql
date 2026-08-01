-- Persist Impact Booster Q&A + assessment per EPB MPA section.
-- Shape: { strength?, missingLevers?, summary?, answers: [...], freeform? }
-- Answers stay on the section only — never copied with statement text between MPAs.
ALTER TABLE epb_shell_sections
ADD COLUMN IF NOT EXISTS impact_booster JSONB NOT NULL DEFAULT '{}'::jsonb;
