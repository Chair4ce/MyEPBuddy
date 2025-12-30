-- Add enhanced metadata columns to refined_statements
-- This enables:
-- 1. Multi-MPA tagging for EPB statements
-- 2. Award category, win status, and level tracking
-- 3. LLM example flagging for including statements in generation prompts

-- Add applicable_mpas array for EPB statements that can fit multiple MPAs
-- The existing 'mpa' column remains as the primary/display MPA
ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS applicable_mpas TEXT[] DEFAULT '{}';

-- Add award-specific fields
-- award_category: For 1206 categories (leadership_job_performance, significant_self_improvement, base_community_involvement)
ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS award_category TEXT;

-- is_winning_package: Whether this statement was part of a winning award package
ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS is_winning_package BOOLEAN DEFAULT false;

-- win_level: The level at which the award was won
ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS win_level TEXT CHECK (win_level IS NULL OR win_level IN ('squadron', 'group', 'wing', 'tenant_unit', 'haf'));

-- use_as_llm_example: Whether to include this statement as an example in LLM prompts
-- This allows users to curate their own set of high-quality examples
ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS use_as_llm_example BOOLEAN DEFAULT false;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_refined_statements_applicable_mpas ON refined_statements USING GIN (applicable_mpas);
CREATE INDEX IF NOT EXISTS idx_refined_statements_award_category ON refined_statements(award_category) WHERE award_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refined_statements_is_winning ON refined_statements(is_winning_package) WHERE is_winning_package = true;
CREATE INDEX IF NOT EXISTS idx_refined_statements_win_level ON refined_statements(win_level) WHERE win_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refined_statements_llm_example ON refined_statements(use_as_llm_example) WHERE use_as_llm_example = true;

-- Composite index for fetching LLM examples by type
CREATE INDEX IF NOT EXISTS idx_refined_statements_llm_example_type ON refined_statements(statement_type, use_as_llm_example) WHERE use_as_llm_example = true;

-- Update the shared_statements_view to include new fields
DROP VIEW IF EXISTS shared_statements_view;

CREATE OR REPLACE VIEW shared_statements_view 
WITH (security_invoker = true, security_barrier = true) AS
SELECT 
  rs.id,
  rs.user_id AS owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.cycle_year,
  rs.statement_type,
  rs.is_favorite,
  rs.applicable_mpas,
  rs.award_category,
  rs.is_winning_package,
  rs.win_level,
  rs.use_as_llm_example,
  rs.created_at,
  rs.updated_at,
  ss.share_type,
  ss.shared_with_id,
  ss.id AS share_id,
  p.full_name AS owner_name,
  p.rank AS owner_rank
FROM refined_statements rs
JOIN statement_shares ss ON ss.statement_id = rs.id
JOIN profiles p ON p.id = rs.user_id;

-- Add comment for documentation
COMMENT ON COLUMN refined_statements.applicable_mpas IS 'Array of MPA keys this statement could apply to (for EPB statements that fit multiple categories)';
COMMENT ON COLUMN refined_statements.award_category IS '1206 category for award statements (leadership_job_performance, significant_self_improvement, base_community_involvement)';
COMMENT ON COLUMN refined_statements.is_winning_package IS 'Whether this statement was part of a winning award package';
COMMENT ON COLUMN refined_statements.win_level IS 'The level at which the award was won (squadron, group, wing, tenant_unit, haf)';
COMMENT ON COLUMN refined_statements.use_as_llm_example IS 'Whether to include this statement as an example in LLM prompts for generation';


