-- Update AF Form 1206 default categories from three (Leadership & Job Performance,
-- Self-Improvement, Base/Community) to two (Performance in Primary Duty, Whole Airman Concept).
-- Migrates existing award shell sections to the new category keys.

-- ============================================
-- 1. Migrate existing sections to new category keys
-- ============================================

-- Step 1a: Rename leadership_job_performance → performance_in_primary_duty
UPDATE public.award_shell_sections
SET category = 'performance_in_primary_duty'
WHERE category = 'leadership_job_performance';

-- Step 1b: Rename significant_self_improvement → whole_airman_concept
UPDATE public.award_shell_sections
SET category = 'whole_airman_concept'
WHERE category = 'significant_self_improvement';

-- Step 1c: For base_community_involvement sections that have content,
-- merge them into whole_airman_concept with unique slot indices.
-- Uses a loop to assign incrementing slot_index per shell.
DO $$
DECLARE
  r RECORD;
  next_slot INTEGER;
BEGIN
  FOR r IN
    SELECT id, shell_id
    FROM public.award_shell_sections
    WHERE category = 'base_community_involvement'
      AND statement_text IS NOT NULL
      AND statement_text <> ''
    ORDER BY shell_id, slot_index
  LOOP
    SELECT COALESCE(MAX(slot_index), -1) + 1
    INTO next_slot
    FROM public.award_shell_sections
    WHERE shell_id = r.shell_id
      AND category = 'whole_airman_concept';

    UPDATE public.award_shell_sections
    SET category = 'whole_airman_concept',
        slot_index = next_slot
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Step 1d: Delete remaining empty base_community_involvement sections
DELETE FROM public.award_shell_sections
WHERE category = 'base_community_involvement';

-- ============================================
-- 2. Update the trigger that creates default sections for new award shells
-- ============================================
CREATE OR REPLACE FUNCTION public.create_award_shell_sections()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.award_shell_sections (shell_id, category, slot_index, last_edited_by)
  VALUES 
    (NEW.id, 'performance_in_primary_duty', 0, NEW.created_by),
    (NEW.id, 'whole_airman_concept', 0, NEW.created_by);
  RETURN NEW;
END;
$$;

-- ============================================
-- 3. Update get_award_shell_with_sections ordering
-- ============================================
DROP FUNCTION IF EXISTS public.get_award_shell_with_sections(UUID);

CREATE OR REPLACE FUNCTION public.get_award_shell_with_sections(p_shell_id UUID)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  FROM public.award_shells aws
  LEFT JOIN public.award_shell_sections ass ON ass.shell_id = aws.id
  WHERE aws.id = p_shell_id
  ORDER BY 
    CASE ass.category
      WHEN 'performance_in_primary_duty' THEN 1
      WHEN 'whole_airman_concept' THEN 2
      ELSE 3
    END,
    ass.slot_index;
END;
$$;

-- ============================================
-- 4. Migrate existing refined_statements award_category values
-- ============================================
UPDATE public.refined_statements
SET award_category = 'performance_in_primary_duty'
WHERE award_category = 'leadership_job_performance';

UPDATE public.refined_statements
SET award_category = 'whole_airman_concept'
WHERE award_category IN ('significant_self_improvement', 'base_community_involvement');

COMMENT ON COLUMN refined_statements.award_category IS '1206 category for award statements (performance_in_primary_duty, whole_airman_concept)';
