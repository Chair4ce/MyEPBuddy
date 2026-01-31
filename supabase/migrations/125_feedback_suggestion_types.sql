-- Migration: 125_feedback_suggestion_types.sql
-- Description: Add suggestion types and rewrite support to feedback comments
-- Author: System
-- Date: 2026-01-29

-- ============================================================================
-- ADD NEW COLUMNS TO FEEDBACK_COMMENTS
-- Supports: comment, replace, delete types and full section rewrites
-- ============================================================================

-- Add suggestion_type column (comment, replace, delete)
ALTER TABLE feedback_comments 
ADD COLUMN IF NOT EXISTS suggestion_type TEXT DEFAULT 'comment' 
CHECK (suggestion_type IN ('comment', 'replace', 'delete'));

-- Add replacement_text for 'replace' type suggestions
ALTER TABLE feedback_comments 
ADD COLUMN IF NOT EXISTS replacement_text TEXT;

-- Add is_full_rewrite flag for complete section rewrites
ALTER TABLE feedback_comments 
ADD COLUMN IF NOT EXISTS is_full_rewrite BOOLEAN DEFAULT false;

-- Add rewrite_text for full section rewrites
ALTER TABLE feedback_comments 
ADD COLUMN IF NOT EXISTS rewrite_text TEXT;

-- ============================================================================
-- UPDATE submit_mentor_feedback FUNCTION
-- Include new fields when inserting comments
-- ============================================================================

-- Drop the existing function first to allow changing return type
DROP FUNCTION IF EXISTS submit_mentor_feedback(TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION submit_mentor_feedback(
  p_token TEXT,
  p_reviewer_name TEXT,
  p_reviewer_name_source TEXT,
  p_comments JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
  v_shell_type TEXT;
  v_shell_id UUID;
  v_created_by UUID;
  v_is_anonymous BOOLEAN;
  v_session_id UUID;
  v_comment JSONB;
BEGIN
  -- Validate token and get details
  SELECT id, review_tokens.shell_type, review_tokens.shell_id, review_tokens.created_by, review_tokens.is_anonymous
  INTO v_token_id, v_shell_type, v_shell_id, v_created_by, v_is_anonymous
  FROM review_tokens
  WHERE token = p_token
    AND status = 'active'
    AND expires_at > now();

  IF v_token_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired review token';
  END IF;

  -- Validate reviewer name source
  IF p_reviewer_name_source NOT IN ('label', 'provided', 'generated') THEN
    RAISE EXCEPTION 'Invalid reviewer name source';
  END IF;

  -- Validate at least one comment
  IF jsonb_array_length(p_comments) = 0 THEN
    RAISE EXCEPTION 'At least one comment is required';
  END IF;

  -- Create feedback session (user_id is the token creator, not the reviewer)
  INSERT INTO feedback_sessions (
    review_token_id,
    shell_type,
    shell_id,
    user_id,
    reviewer_name,
    reviewer_name_source,
    comment_count
  ) VALUES (
    v_token_id,
    v_shell_type,
    v_shell_id,
    v_created_by,
    p_reviewer_name,
    p_reviewer_name_source,
    jsonb_array_length(p_comments)
  )
  RETURNING id INTO v_session_id;

  -- Insert comments with new fields
  FOR v_comment IN SELECT * FROM jsonb_array_elements(p_comments)
  LOOP
    INSERT INTO feedback_comments (
      session_id,
      section_key,
      original_text,
      highlight_start,
      highlight_end,
      highlighted_text,
      comment_text,
      suggestion,
      suggestion_type,
      replacement_text,
      is_full_rewrite,
      rewrite_text
    ) VALUES (
      v_session_id,
      v_comment->>'sectionKey',
      v_comment->>'originalText',
      (v_comment->>'highlightStart')::INT,
      (v_comment->>'highlightEnd')::INT,
      v_comment->>'highlightedText',
      v_comment->>'commentText',
      v_comment->>'suggestion',
      COALESCE(v_comment->>'suggestionType', 'comment'),
      v_comment->>'replacementText',
      COALESCE((v_comment->>'isFullRewrite')::BOOLEAN, false),
      v_comment->>'rewriteText'
    );
  END LOOP;

  -- Only mark token as submitted for non-anonymous links
  IF NOT v_is_anonymous THEN
    UPDATE review_tokens
    SET status = 'submitted'
    WHERE id = v_token_id;
  END IF;

  RETURN v_session_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION submit_mentor_feedback(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
