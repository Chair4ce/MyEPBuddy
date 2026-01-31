-- Migration: 121_mentor_feedback_system.sql
-- Description: Mentor Feedback System - shareable review links with Word-doc-style commenting
-- Author: System
-- Date: 2026-01-30

-- ============================================================================
-- REVIEW TOKENS TABLE
-- Tokenized shareable links for mentor review
-- ============================================================================

CREATE TABLE review_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  shell_type TEXT NOT NULL CHECK (shell_type IN ('epb', 'award', 'decoration')),
  shell_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ratee_name TEXT NOT NULL,
  ratee_rank TEXT,
  link_label TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  recipient_email TEXT,
  email_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for review_tokens
CREATE INDEX idx_review_tokens_token ON review_tokens(token);
CREATE INDEX idx_review_tokens_created_by ON review_tokens(created_by);
CREATE INDEX idx_review_tokens_shell ON review_tokens(shell_type, shell_id);
CREATE INDEX idx_review_tokens_status ON review_tokens(status);
CREATE INDEX idx_review_tokens_expires_at ON review_tokens(expires_at) WHERE status = 'active';

-- Enable RLS
ALTER TABLE review_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own tokens
CREATE POLICY "Users can view own review tokens"
  ON review_tokens FOR SELECT
  USING (created_by = (SELECT auth.uid()));

-- Policy: Users can create tokens for shells they own
CREATE POLICY "Users can create review tokens"
  ON review_tokens FOR INSERT
  WITH CHECK (created_by = (SELECT auth.uid()));

-- Policy: Users can update their own tokens (e.g., to expire them)
CREATE POLICY "Users can update own review tokens"
  ON review_tokens FOR UPDATE
  USING (created_by = (SELECT auth.uid()));

-- Policy: Users can delete their own tokens
CREATE POLICY "Users can delete own review tokens"
  ON review_tokens FOR DELETE
  USING (created_by = (SELECT auth.uid()));

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON review_tokens TO authenticated;

-- ============================================================================
-- FEEDBACK SESSIONS TABLE
-- A submitted batch of feedback from one reviewer
-- ============================================================================

CREATE TABLE feedback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_token_id UUID NOT NULL REFERENCES review_tokens(id) ON DELETE CASCADE,
  shell_type TEXT NOT NULL CHECK (shell_type IN ('epb', 'award', 'decoration')),
  shell_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  reviewer_name_source TEXT NOT NULL CHECK (reviewer_name_source IN ('label', 'provided', 'generated')),
  comment_count INT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for feedback_sessions
CREATE INDEX idx_feedback_sessions_token ON feedback_sessions(review_token_id);
CREATE INDEX idx_feedback_sessions_user ON feedback_sessions(user_id);
CREATE INDEX idx_feedback_sessions_shell ON feedback_sessions(shell_type, shell_id);
CREATE INDEX idx_feedback_sessions_submitted ON feedback_sessions(submitted_at DESC);

-- Enable RLS
ALTER TABLE feedback_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view feedback sessions for shells they own
CREATE POLICY "Users can view own feedback sessions"
  ON feedback_sessions FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Grant access (INSERT handled by secure function)
GRANT SELECT ON feedback_sessions TO authenticated;

-- ============================================================================
-- FEEDBACK COMMENTS TABLE
-- Individual comments within a session
-- ============================================================================

CREATE TABLE feedback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  original_text TEXT,
  highlight_start INT,
  highlight_end INT,
  highlighted_text TEXT,
  comment_text TEXT NOT NULL,
  suggestion TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for feedback_comments
CREATE INDEX idx_feedback_comments_session ON feedback_comments(session_id);
CREATE INDEX idx_feedback_comments_status ON feedback_comments(status);

-- Enable RLS
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view comments for their feedback sessions
CREATE POLICY "Users can view own feedback comments"
  ON feedback_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback_sessions fs
      WHERE fs.id = feedback_comments.session_id
      AND fs.user_id = (SELECT auth.uid())
    )
  );

-- Policy: Users can update comments for their feedback sessions (accept/dismiss)
CREATE POLICY "Users can update own feedback comments"
  ON feedback_comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM feedback_sessions fs
      WHERE fs.id = feedback_comments.session_id
      AND fs.user_id = (SELECT auth.uid())
    )
  );

-- Grant access (INSERT handled by secure function)
GRANT SELECT, UPDATE ON feedback_comments TO authenticated;

-- ============================================================================
-- SECURE FUNCTION: Validate Token (for public access)
-- Returns token details if valid and active
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_review_token(p_token TEXT)
RETURNS TABLE (
  token_id UUID,
  shell_type TEXT,
  shell_id UUID,
  created_by UUID,
  ratee_name TEXT,
  ratee_rank TEXT,
  link_label TEXT,
  is_anonymous BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First, expire any tokens past their expiration date
  UPDATE review_tokens
  SET status = 'expired'
  WHERE review_tokens.token = p_token
    AND review_tokens.status = 'active'
    AND review_tokens.expires_at < now();

  -- Return token details if active
  RETURN QUERY
  SELECT 
    rt.id,
    rt.shell_type,
    rt.shell_id,
    rt.created_by,
    rt.ratee_name,
    rt.ratee_rank,
    rt.link_label,
    rt.is_anonymous,
    rt.status
  FROM review_tokens rt
  WHERE rt.token = p_token;
END;
$$;

-- Grant execute to anon for public validation
GRANT EXECUTE ON FUNCTION validate_review_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION validate_review_token(TEXT) TO authenticated;

-- ============================================================================
-- SECURE FUNCTION: Get EPB Shell for Review (for public access)
-- Returns EPB shell data if token is valid
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
  
  -- Return EPB shell data with sections
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

-- Grant execute to anon for public access
GRANT EXECUTE ON FUNCTION get_epb_shell_for_review(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_epb_shell_for_review(TEXT) TO authenticated;

-- ============================================================================
-- SECURE FUNCTION: Submit Mentor Feedback (for public access)
-- Creates feedback session and comments, expires the token
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
  
  -- Mark token as submitted (expires it)
  UPDATE review_tokens
  SET status = 'submitted'
  WHERE id = v_token_record.token_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Thank you for your feedback!',
    'session_id', v_session_id
  );
END;
$$;

-- Grant execute to anon for public submission
GRANT EXECUTE ON FUNCTION submit_mentor_feedback(TEXT, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_mentor_feedback(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- VIEW: Feedback Sessions with Comment Count
-- ============================================================================

CREATE VIEW feedback_sessions_view WITH (security_invoker = true) AS
SELECT 
  fs.id,
  fs.review_token_id,
  fs.shell_type,
  fs.shell_id,
  fs.user_id,
  fs.reviewer_name,
  fs.reviewer_name_source,
  fs.comment_count,
  fs.submitted_at,
  fs.created_at,
  rt.link_label,
  rt.is_anonymous,
  (
    SELECT COUNT(*) 
    FROM feedback_comments fc 
    WHERE fc.session_id = fs.id AND fc.status = 'pending'
  ) as pending_count,
  (
    SELECT COUNT(*) 
    FROM feedback_comments fc 
    WHERE fc.session_id = fs.id AND fc.status = 'accepted'
  ) as accepted_count,
  (
    SELECT COUNT(*) 
    FROM feedback_comments fc 
    WHERE fc.session_id = fs.id AND fc.status = 'dismissed'
  ) as dismissed_count
FROM feedback_sessions fs
JOIN review_tokens rt ON rt.id = fs.review_token_id;

GRANT SELECT ON feedback_sessions_view TO authenticated;

-- ============================================================================
-- FUNCTION: Generate Secure Token
-- Creates a cryptographically random token
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_review_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  -- Generate 32 bytes of random data as hex (64 characters)
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_review_token() TO authenticated;
