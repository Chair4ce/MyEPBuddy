-- Migration: 124_award_decoration_review.sql
-- Description: Add review functions for Award and Decoration shells
-- Author: System
-- Date: 2026-01-31

-- ============================================================================
-- FUNCTION: Get Award Shell for Review (for public access)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_award_shell_for_review(p_token TEXT)
RETURNS TABLE (
  shell_id UUID,
  award_title TEXT,
  category TEXT,
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
  
  IF v_token_record.shell_type != 'award' THEN
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
      (v_snapshot->>'title')::TEXT,
      NULL::TEXT,  -- category not in snapshot
      (v_snapshot->>'cycleYear')::INT,
      v_token_record.ratee_name,
      v_token_record.ratee_rank,
      v_token_record.link_label,
      v_token_record.is_anonymous,
      v_snapshot->'sections';
    RETURN;
  END IF;
  
  -- Fallback to live data
  RETURN QUERY
  SELECT 
    aws.id,
    aws.award_title,
    aws.category,
    aws.cycle_year,
    v_token_record.ratee_name,
    v_token_record.ratee_rank,
    v_token_record.link_label,
    v_token_record.is_anonymous,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', awss.category_key,
          'label', awss.category_key,
          'content', awss.statement_text
        )
      )
      FROM award_shell_sections awss
      WHERE awss.shell_id = aws.id
    ) as sections
  FROM award_shells aws
  WHERE aws.id = v_token_record.shell_id;
END;
$$;

-- Grant execute to anon for public access
GRANT EXECUTE ON FUNCTION get_award_shell_for_review(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_award_shell_for_review(TEXT) TO authenticated;

-- ============================================================================
-- FUNCTION: Get Decoration Shell for Review (for public access)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_decoration_shell_for_review(p_token TEXT)
RETURNS TABLE (
  shell_id UUID,
  award_type TEXT,
  reason TEXT,
  duty_title TEXT,
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
  
  IF v_token_record.shell_type != 'decoration' THEN
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
      (v_snapshot->>'title')::TEXT,
      NULL::TEXT,  -- reason not in snapshot
      NULL::TEXT,  -- duty_title not in snapshot
      v_token_record.ratee_name,
      v_token_record.ratee_rank,
      v_token_record.link_label,
      v_token_record.is_anonymous,
      v_snapshot->'sections';
    RETURN;
  END IF;
  
  -- Fallback to live data
  RETURN QUERY
  SELECT 
    ds.id,
    ds.award_type::TEXT,
    ds.reason::TEXT,
    ds.duty_title,
    v_token_record.ratee_name,
    v_token_record.ratee_rank,
    v_token_record.link_label,
    v_token_record.is_anonymous,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'citation',
        'label', 'Citation',
        'content', ds.citation_text
      )
    ) as sections
  FROM decoration_shells ds
  WHERE ds.id = v_token_record.shell_id;
END;
$$;

-- Grant execute to anon for public access
GRANT EXECUTE ON FUNCTION get_decoration_shell_for_review(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_decoration_shell_for_review(TEXT) TO authenticated;
