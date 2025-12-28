-- Add award period types to support Annual, Quarterly, and Special awards
-- Remove the unique constraint to allow multiple awards per user

-- ============================================
-- DROP EXISTING UNIQUE CONSTRAINT
-- ============================================
-- Allow multiple awards per user/member (no longer limited to one per cycle year)
ALTER TABLE award_shells 
DROP CONSTRAINT IF EXISTS unique_award_shell_per_user_cycle;

-- ============================================
-- ADD NEW COLUMNS FOR AWARD PERIOD
-- ============================================

-- Award period type: annual, quarterly, or special
ALTER TABLE award_shells
ADD COLUMN award_period_type TEXT NOT NULL DEFAULT 'annual' 
CHECK (award_period_type IN ('annual', 'quarterly', 'special'));

-- Quarter for quarterly awards (1, 2, 3, or 4)
ALTER TABLE award_shells
ADD COLUMN quarter INTEGER CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4);

-- Whether to use fiscal year (Oct 1 - Sep 30) instead of calendar year
ALTER TABLE award_shells
ADD COLUMN is_fiscal_year BOOLEAN NOT NULL DEFAULT false;

-- Period start and end dates (calculated for annual/quarterly, custom for special)
ALTER TABLE award_shells
ADD COLUMN period_start_date DATE;

ALTER TABLE award_shells
ADD COLUMN period_end_date DATE;

-- ============================================
-- BACKFILL EXISTING DATA
-- ============================================
-- Set existing awards as annual calendar year with calculated dates
UPDATE award_shells
SET 
  award_period_type = 'annual',
  is_fiscal_year = false,
  period_start_date = make_date(cycle_year, 1, 1),
  period_end_date = make_date(cycle_year, 12, 31)
WHERE period_start_date IS NULL;

-- ============================================
-- ADD CONSTRAINT FOR QUARTERLY AWARDS
-- ============================================
-- Quarter is required when award_period_type is 'quarterly'
ALTER TABLE award_shells
ADD CONSTRAINT quarterly_requires_quarter 
CHECK (
  award_period_type != 'quarterly' OR quarter IS NOT NULL
);

-- ============================================
-- ADD INDEX FOR PERIOD QUERIES
-- ============================================
CREATE INDEX idx_award_shells_period_type ON award_shells(award_period_type);
CREATE INDEX idx_award_shells_period_dates ON award_shells(period_start_date, period_end_date);

-- ============================================
-- HELPER FUNCTION: Calculate period dates
-- ============================================
CREATE OR REPLACE FUNCTION calculate_award_period_dates(
  p_period_type TEXT,
  p_year INTEGER,
  p_quarter INTEGER,
  p_is_fiscal BOOLEAN
)
RETURNS TABLE (start_date DATE, end_date DATE) AS $$
BEGIN
  IF p_period_type = 'annual' THEN
    IF p_is_fiscal THEN
      -- Fiscal year: Oct 1 of previous year to Sep 30 of given year
      RETURN QUERY SELECT 
        make_date(p_year - 1, 10, 1)::DATE,
        make_date(p_year, 9, 30)::DATE;
    ELSE
      -- Calendar year: Jan 1 to Dec 31
      RETURN QUERY SELECT 
        make_date(p_year, 1, 1)::DATE,
        make_date(p_year, 12, 31)::DATE;
    END IF;
  ELSIF p_period_type = 'quarterly' THEN
    IF p_is_fiscal THEN
      -- Fiscal quarters: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
      CASE p_quarter
        WHEN 1 THEN
          RETURN QUERY SELECT 
            make_date(p_year - 1, 10, 1)::DATE,
            make_date(p_year - 1, 12, 31)::DATE;
        WHEN 2 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 1, 1)::DATE,
            make_date(p_year, 3, 31)::DATE;
        WHEN 3 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 4, 1)::DATE,
            make_date(p_year, 6, 30)::DATE;
        WHEN 4 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 7, 1)::DATE,
            make_date(p_year, 9, 30)::DATE;
      END CASE;
    ELSE
      -- Calendar quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
      CASE p_quarter
        WHEN 1 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 1, 1)::DATE,
            make_date(p_year, 3, 31)::DATE;
        WHEN 2 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 4, 1)::DATE,
            make_date(p_year, 6, 30)::DATE;
        WHEN 3 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 7, 1)::DATE,
            make_date(p_year, 9, 30)::DATE;
        WHEN 4 THEN
          RETURN QUERY SELECT 
            make_date(p_year, 10, 1)::DATE,
            make_date(p_year, 12, 31)::DATE;
      END CASE;
    END IF;
  END IF;
  -- For 'special', dates are provided directly, no calculation needed
  RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- UPDATE get_award_shell_with_sections FUNCTION
-- ============================================
-- Drop and recreate since return type is changing
DROP FUNCTION IF EXISTS get_award_shell_with_sections(UUID);

CREATE OR REPLACE FUNCTION get_award_shell_with_sections(p_shell_id UUID)
RETURNS TABLE (
  shell_id UUID,
  user_id UUID,
  team_member_id UUID,
  cycle_year INTEGER,
  award_level TEXT,
  award_category TEXT,
  sentences_per_statement INTEGER,
  created_by UUID,
  shell_created_at TIMESTAMPTZ,
  shell_updated_at TIMESTAMPTZ,
  section_id UUID,
  category TEXT,
  slot_index INTEGER,
  statement_text TEXT,
  source_type TEXT,
  custom_context TEXT,
  selected_action_ids JSONB,
  section_updated_at TIMESTAMPTZ,
  award_period_type TEXT,
  quarter INTEGER,
  is_fiscal_year BOOLEAN,
  period_start_date DATE,
  period_end_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aws.id AS shell_id,
    aws.user_id,
    aws.team_member_id,
    aws.cycle_year,
    aws.award_level,
    aws.award_category,
    aws.sentences_per_statement,
    aws.created_by,
    aws.created_at AS shell_created_at,
    aws.updated_at AS shell_updated_at,
    ass.id AS section_id,
    ass.category,
    ass.slot_index,
    ass.statement_text,
    ass.source_type,
    ass.custom_context,
    ass.selected_action_ids,
    ass.updated_at AS section_updated_at,
    aws.award_period_type,
    aws.quarter,
    aws.is_fiscal_year,
    aws.period_start_date,
    aws.period_end_date
  FROM award_shells aws
  LEFT JOIN award_shell_sections ass ON ass.shell_id = aws.id
  WHERE aws.id = p_shell_id
  ORDER BY 
    CASE ass.category
      WHEN 'leadership_job_performance' THEN 1
      WHEN 'significant_self_improvement' THEN 2
      WHEN 'base_community_involvement' THEN 3
      ELSE 4
    END,
    ass.slot_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

