-- Accomplishment Comments / Request for Information (RFI) System
-- Allows chain of supervision to comment on subordinate accomplishments
-- Comments are only visible to the chain of supervision (not co-workers)

-- ============================================
-- 1. COMMENTS TABLE
-- ============================================

CREATE TABLE accomplishment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accomplishment_id UUID NOT NULL REFERENCES accomplishments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES FOR EFFICIENT QUERIES
-- ============================================

CREATE INDEX idx_accomplishment_comments_accomplishment 
  ON accomplishment_comments(accomplishment_id);

CREATE INDEX idx_accomplishment_comments_author 
  ON accomplishment_comments(author_id);

CREATE INDEX idx_accomplishment_comments_unresolved 
  ON accomplishment_comments(accomplishment_id) 
  WHERE is_resolved = FALSE;

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER update_accomplishment_comments_updated_at
  BEFORE UPDATE ON accomplishment_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. RLS POLICIES
-- ============================================

ALTER TABLE accomplishment_comments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is in the chain of supervision for an accomplishment
CREATE OR REPLACE FUNCTION is_in_accomplishment_chain(acc_id UUID, viewer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  acc_user_id UUID;
  acc_team_member_id UUID;
  acc_supervisor_id UUID;
BEGIN
  -- Get the accomplishment details
  SELECT user_id, team_member_id INTO acc_user_id, acc_team_member_id
  FROM accomplishments WHERE id = acc_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Case 1: For managed member accomplishments
  IF acc_team_member_id IS NOT NULL THEN
    -- Get the supervisor_id from team_members
    SELECT supervisor_id INTO acc_supervisor_id
    FROM team_members WHERE id = acc_team_member_id;
    
    -- Check if viewer is the direct supervisor
    IF acc_supervisor_id = viewer_id THEN
      RETURN TRUE;
    END IF;
    
    -- Check if viewer is in the supervisor chain of the managed member's supervisor
    IF EXISTS (
      SELECT 1 FROM get_supervisor_chain(acc_supervisor_id) 
      WHERE supervisor_id = viewer_id
    ) THEN
      RETURN TRUE;
    END IF;
    
    RETURN FALSE;
  END IF;
  
  -- Case 2: For regular profile accomplishments
  -- Check if viewer is in the supervisor chain of the accomplishment owner
  IF EXISTS (
    SELECT 1 FROM get_supervisor_chain(acc_user_id) 
    WHERE supervisor_id = viewer_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Users can view comments on accomplishments in their chain
CREATE POLICY "View comments in chain"
  ON accomplishment_comments FOR SELECT
  USING (
    -- Comment author can always see their own comments
    author_id = auth.uid()
    OR
    -- Accomplishment owner can see comments on their accomplishments
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = auth.uid() OR created_by = auth.uid()
    )
    OR
    -- Chain of supervision can see comments
    is_in_accomplishment_chain(accomplishment_id, auth.uid())
  );

-- Policy: Chain of supervision can insert comments
CREATE POLICY "Insert comments in chain"
  ON accomplishment_comments FOR INSERT
  WITH CHECK (
    -- Author must be the current user
    author_id = auth.uid()
    AND
    -- Must be in the chain of supervision
    is_in_accomplishment_chain(accomplishment_id, auth.uid())
  );

-- Policy: Authors can update their own comments
CREATE POLICY "Update own comments"
  ON accomplishment_comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Policy: Accomplishment owner can resolve comments
CREATE POLICY "Owner can resolve comments"
  ON accomplishment_comments FOR UPDATE
  USING (
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = auth.uid() OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = auth.uid() OR created_by = auth.uid()
    )
  );

-- Policy: Authors can delete their own comments
CREATE POLICY "Delete own comments"
  ON accomplishment_comments FOR DELETE
  USING (author_id = auth.uid());

-- ============================================
-- 5. VIEW FOR COMMENTS WITH AUTHOR INFO
-- ============================================

CREATE OR REPLACE VIEW accomplishment_comments_with_author AS
SELECT 
  c.*,
  p.full_name AS author_name,
  p.rank AS author_rank,
  p.avatar_url AS author_avatar_url,
  rp.full_name AS resolved_by_name,
  rp.rank AS resolved_by_rank
FROM accomplishment_comments c
JOIN profiles p ON c.author_id = p.id
LEFT JOIN profiles rp ON c.resolved_by = rp.id;

-- Grant access to the view
GRANT SELECT ON accomplishment_comments_with_author TO authenticated;

-- ============================================
-- 6. FUNCTION TO GET COMMENT COUNTS
-- ============================================

CREATE OR REPLACE FUNCTION get_accomplishment_comment_counts(acc_ids UUID[])
RETURNS TABLE (
  accomplishment_id UUID,
  total_count BIGINT,
  unresolved_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.accomplishment_id,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE NOT c.is_resolved) AS unresolved_count
  FROM accomplishment_comments c
  WHERE c.accomplishment_id = ANY(acc_ids)
  GROUP BY c.accomplishment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_accomplishment_comment_counts TO authenticated;

