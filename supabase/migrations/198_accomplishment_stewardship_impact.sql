-- Structured AF stewardship impact on accomplishments (man-hours / funds / resources / outcome).
-- Shape: { time?, money?, resources?, outcome? }
-- impact text column remains for legacy display + EPB generate concatenation.
ALTER TABLE accomplishments
ADD COLUMN IF NOT EXISTS stewardship_impact JSONB NOT NULL DEFAULT '{}'::jsonb;
