-- Migration: 122_anonymous_link_multi_submit.sql
-- Description: Allow anonymous links to receive multiple submissions
-- Author: System
-- Date: 2026-01-31

-- ============================================================================
-- UPDATE: Submit Mentor Feedback Function
-- Only expire labeled links (not anonymous) after submission
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_mentor_feedback(
  p_token TEXT,
  p_reviewer_name TEXT,
  p_reviewer_name_source TEXT,
  p_comments JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record RECORD;
  v_session_id UUID;
  v_comment JSONB;
  v_comment_count INT;
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM validate_review_token(p_token) vrt
  LIMIT 1;
  
  IF v_token_record.token_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;
  
  IF v_token_record.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This review link has expired or already been used');
  END IF;
  
  -- Validate comments array
  IF p_comments IS NULL OR jsonb_array_length(p_comments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one comment is required');
  END IF;
  
  v_comment_count := jsonb_array_length(p_comments);
  
  -- Create feedback session
  INSERT INTO feedback_sessions (
    review_token_id,
    shell_type,
    shell_id,
    user_id,
    reviewer_name,
    reviewer_name_source,
    comment_count
  ) VALUES (
    v_token_record.token_id,
    v_token_record.shell_type,
    v_token_record.shell_id,
    v_token_record.created_by,
    p_reviewer_name,
    p_reviewer_name_source,
    v_comment_count
  )
  RETURNING id INTO v_session_id;
  
  -- Insert all comments
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
      suggestion
    ) VALUES (
      v_session_id,
      v_comment->>'section_key',
      v_comment->>'original_text',
      (v_comment->>'highlight_start')::INT,
      (v_comment->>'highlight_end')::INT,
      v_comment->>'highlighted_text',
      v_comment->>'comment_text',
      v_comment->>'suggestion'
    );
  END LOOP;
  
  -- Only expire labeled links (not anonymous) after submission
  -- Anonymous links can receive multiple submissions
  IF NOT v_token_record.is_anonymous THEN
    UPDATE review_tokens
    SET status = 'submitted'
    WHERE id = v_token_record.token_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Thank you for your feedback!',
    'session_id', v_session_id
  );
END;
$$;
