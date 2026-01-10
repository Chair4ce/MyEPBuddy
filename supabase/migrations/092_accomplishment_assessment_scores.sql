-- Migration: Add assessment scores to accomplishments
-- This enables AI-powered scoring of accomplishments for MPA relevancy and overall quality

-- Add assessment columns to accomplishments table
ALTER TABLE accomplishments
ADD COLUMN IF NOT EXISTS assessment_scores JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS assessment_model TEXT DEFAULT NULL;

-- Create index for efficient querying of assessment scores
-- This enables fast sorting/filtering by MPA relevancy scores
CREATE INDEX IF NOT EXISTS idx_accomplishments_assessment_scores 
ON accomplishments USING GIN (assessment_scores);

-- Add index on assessed_at for finding unassessed accomplishments
CREATE INDEX IF NOT EXISTS idx_accomplishments_assessed_at 
ON accomplishments (assessed_at) 
WHERE assessed_at IS NULL;

-- Comment on the structure of assessment_scores JSONB:
-- {
--   "mpa_relevancy": {
--     "executing_mission": 85,      -- 0-100 score for relevancy to this MPA
--     "leading_people": 40,
--     "managing_resources": 70,
--     "improving_unit": 60
--   },
--   "overall_score": 78,            -- 0-100 overall quality score
--   "quality_indicators": {         -- Extensible quality metrics
--     "action_clarity": 85,         -- How clearly the action is described
--     "impact_significance": 75,    -- Significance of the impact
--     "metrics_quality": 60,        -- Quality of quantifiable metrics
--     "scope_definition": 80        -- How well scope/scale is defined
--   },
--   "primary_mpa": "executing_mission",  -- Best matching MPA
--   "secondary_mpa": "managing_resources" -- Second best match (if close)
-- }

COMMENT ON COLUMN accomplishments.assessment_scores IS 'AI-generated scores for MPA relevancy (0-100 per MPA) and overall quality indicators';
COMMENT ON COLUMN accomplishments.assessed_at IS 'Timestamp when the AI assessment was performed';
COMMENT ON COLUMN accomplishments.assessment_model IS 'The AI model used for assessment (e.g., gemini-2.0-flash)';
