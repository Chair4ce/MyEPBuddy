-- Private Comments Feature for Accomplishment Comments
-- Allows users to send private comments visible only to sender and specific recipient
-- within the chain of supervision

-- ============================================
-- 1. ADD RECIPIENT COLUMN FOR PRIVATE COMMENTS
-- ============================================

ALTER TABLE accomplishment_comments 
ADD COLUMN recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add index for efficient recipient queries
CREATE INDEX idx_accomplishment_comments_recipient 
  ON accomplishment_comments(recipient_id) 
  WHERE recipient_id IS NOT NULL;

-- ============================================
-- 2. UPDATE RLS POLICIES
-- ============================================

-- Drop existing SELECT policy to recreate with private comment logic
DROP POLICY IF EXISTS "View comments in chain" ON accomplishment_comments;

-- New SELECT policy: Handle both public and private comments
CREATE POLICY "View comments in chain"
  ON accomplishment_comments FOR SELECT
  USING (
    -- Private comment logic: only author and recipient can see
    CASE WHEN recipient_id IS NOT NULL THEN
      author_id = auth.uid() OR recipient_id = auth.uid()
    ELSE
      -- Public comment logic (original behavior)
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
    END
  );

-- Drop and recreate INSERT policy to validate recipient is in chain
DROP POLICY IF EXISTS "Insert comments in chain" ON accomplishment_comments;

CREATE POLICY "Insert comments in chain"
  ON accomplishment_comments FOR INSERT
  WITH CHECK (
    -- Author must be the current user
    author_id = auth.uid()
    AND
    -- Must be in the chain of supervision
    is_in_accomplishment_chain(accomplishment_id, auth.uid())
    AND
    -- If private comment, recipient must also be in the chain or be the accomplishment owner
    (
      recipient_id IS NULL
      OR
      -- Recipient is in the chain of supervision
      is_in_accomplishment_chain(accomplishment_id, recipient_id)
      OR
      -- Recipient is the accomplishment owner
      recipient_id IN (
        SELECT user_id FROM accomplishments WHERE id = accomplishment_id
        UNION
        SELECT created_by FROM accomplishments WHERE id = accomplishment_id
      )
    )
  );

-- ============================================
-- 3. UPDATE VIEW TO INCLUDE RECIPIENT INFO
-- ============================================

DROP VIEW IF EXISTS accomplishment_comments_with_author;

CREATE OR REPLACE VIEW accomplishment_comments_with_author AS
SELECT 
  c.*,
  p.full_name AS author_name,
  p.rank AS author_rank,
  p.avatar_url AS author_avatar_url,
  rp.full_name AS resolved_by_name,
  rp.rank AS resolved_by_rank,
  rec.full_name AS recipient_name,
  rec.rank AS recipient_rank
FROM accomplishment_comments c
JOIN profiles p ON c.author_id = p.id
LEFT JOIN profiles rp ON c.resolved_by = rp.id
LEFT JOIN profiles rec ON c.recipient_id = rec.id;

-- Grant access to the view
GRANT SELECT ON accomplishment_comments_with_author TO authenticated;

-- ============================================
-- 4. UPDATE COMMENT COUNTS TO RESPECT PRIVACY
-- ============================================

-- Drop and recreate the function to filter private comments properly
DROP FUNCTION IF EXISTS get_accomplishment_comment_counts(UUID[]);

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
    -- Only count comments visible to the current user
    AND (
      -- Public comments: no recipient set
      c.recipient_id IS NULL
      OR
      -- Private comments: user is author or recipient
      c.author_id = auth.uid()
      OR
      c.recipient_id = auth.uid()
    )
  GROUP BY c.accomplishment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_accomplishment_comment_counts TO authenticated;

-- ============================================
-- 5. HELPER FUNCTION TO GET CHAIN MEMBERS FOR RECIPIENT SELECTION
-- ============================================

-- Function to get all users in the chain for an accomplishment (for recipient dropdown)
CREATE OR REPLACE FUNCTION get_accomplishment_chain_members(acc_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  rank TEXT,
  is_owner BOOLEAN
) AS $$
DECLARE
  acc_user_id UUID;
  acc_team_member_id UUID;
  owner_supervisor_id UUID;
BEGIN
  -- Get the accomplishment details
  SELECT a.user_id, a.team_member_id INTO acc_user_id, acc_team_member_id
  FROM accomplishments a WHERE a.id = acc_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Case 1: Managed member accomplishment
  IF acc_team_member_id IS NOT NULL THEN
    -- Get managed member's supervisor
    SELECT tm.supervisor_id INTO owner_supervisor_id
    FROM team_members tm WHERE tm.id = acc_team_member_id;
    
    -- Return all supervisors in the chain
    RETURN QUERY
    SELECT 
      sc.supervisor_id AS user_id,
      p.full_name,
      p.rank::TEXT,
      FALSE AS is_owner
    FROM get_supervisor_chain(owner_supervisor_id) sc
    JOIN profiles p ON p.id = sc.supervisor_id
    WHERE sc.supervisor_id != auth.uid(); -- Exclude current user
    
    RETURN;
  END IF;
  
  -- Case 2: Regular profile accomplishment
  -- Return the accomplishment owner first
  RETURN QUERY
  SELECT 
    p.id AS user_id,
    p.full_name,
    p.rank::TEXT,
    TRUE AS is_owner
  FROM profiles p
  WHERE p.id = acc_user_id
    AND p.id != auth.uid(); -- Exclude current user
  
  -- Then return all supervisors in the chain
  RETURN QUERY
  SELECT 
    sc.supervisor_id AS user_id,
    p.full_name,
    p.rank::TEXT,
    FALSE AS is_owner
  FROM get_supervisor_chain(acc_user_id) sc
  JOIN profiles p ON p.id = sc.supervisor_id
  WHERE sc.supervisor_id != auth.uid(); -- Exclude current user
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_accomplishment_chain_members TO authenticated;


