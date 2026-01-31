-- Migration: 123_review_token_snapshot.sql
-- Description: Store EPB snapshot at link creation time
-- Author: System
-- Date: 2026-01-31

-- ============================================================================
-- ADD: Snapshot column to review_tokens
-- Stores the EPB content at the time the link was created
-- ============================================================================

ALTER TABLE review_tokens 
ADD COLUMN content_snapshot JSONB;

-- ============================================================================
-- UPDATE: Get EPB Shell for Review Function
-- Now returns the snapshot if available, otherwise falls back to live data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_epb_shell_for_review(p_token TEXT)
RETURNS TABLE (
  shell_id UUID,
  duty_description TEXT,
  cycle_year INT,
  ratee_name TEXT,
  ratee_rank TEXT,
  link_label TEXT,
  is_anonymous BOOLEAN,
  sections JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record RECORD;
  v_snapshot JSONB;
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM validate_review_token(p_token) vrt
  LIMIT 1;
  
  IF v_token_record.token_id IS NULL THEN
    RETURN;
  END IF;
  
  IF v_token_record.status != 'active' THEN
    RETURN;
  END IF;
  
  IF v_token_record.shell_type != 'epb' THEN
    RETURN;
  END IF;
  
  -- Get the snapshot from the token
  SELECT rt.content_snapshot INTO v_snapshot
  FROM review_tokens rt
  WHERE rt.id = v_token_record.token_id;
  
  -- If snapshot exists, use it
  IF v_snapshot IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      v_token_record.shell_id,
      (v_snapshot->>'duty_description')::TEXT,
      (v_snapshot->>'cycle_year')::INT,
      v_token_record.ratee_name,
      v_token_record.ratee_rank,
      v_token_record.link_label,
      v_token_record.is_anonymous,
      v_snapshot->'sections';
    RETURN;
  END IF;
  
  -- Fallback to live data (for backwards compatibility)
  RETURN QUERY
  SELECT 
    es.id,
    es.duty_description,
    es.cycle_year,
    v_token_record.ratee_name,
    v_token_record.ratee_rank,
    v_token_record.link_label,
    v_token_record.is_anonymous,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'mpa', ess.mpa,
          'statement_text', ess.statement_text
        )
        ORDER BY 
          CASE ess.mpa
            WHEN 'executing_mission' THEN 1
            WHEN 'leading_people' THEN 2
            WHEN 'managing_resources' THEN 3
            WHEN 'improving_unit' THEN 4
            WHEN 'hlr_assessment' THEN 5
            ELSE 6
          END
      )
      FROM epb_shell_sections ess
      WHERE ess.shell_id = es.id
    ) as sections
  FROM epb_shells es
  WHERE es.id = v_token_record.shell_id;
END;
$$;
