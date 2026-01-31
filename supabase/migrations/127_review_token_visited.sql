-- Migration: 127_review_token_visited.sql
-- Description: Track when review links are visited
-- Author: System
-- Date: 2026-01-30

-- ============================================================================
-- ADD: visited_at column to track when a link was first accessed
-- ============================================================================

ALTER TABLE review_tokens 
ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ;

-- ============================================================================
-- UPDATE: validate_review_token function to mark token as visited
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
    AND review_tokens.expires_at <= now();

  -- Mark the token as visited if it's the first access
  UPDATE review_tokens
  SET visited_at = now()
  WHERE review_tokens.token = p_token
    AND review_tokens.visited_at IS NULL
    AND review_tokens.status = 'active';

  -- Return token info
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION validate_review_token(TEXT) TO anon, authenticated;
