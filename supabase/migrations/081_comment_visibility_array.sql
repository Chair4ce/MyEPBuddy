-- Change from single recipient to array of visible_to users
-- This allows selecting multiple people who can see a private comment

-- ============================================
-- 1. DROP EXISTING POLICIES THAT DEPEND ON recipient_id
-- ============================================

DROP POLICY IF EXISTS "View comments in chain" ON accomplishment_comments;
DROP POLICY IF EXISTS "Insert comments in chain" ON accomplishment_comments;

-- ============================================
-- 2. ADD visible_to ARRAY COLUMN
-- ============================================

-- Add new array column
ALTER TABLE accomplishment_comments 
ADD COLUMN visible_to UUID[] DEFAULT NULL;

-- Migrate existing recipient_id data to visible_to array
UPDATE accomplishment_comments 
SET visible_to = ARRAY[recipient_id]
WHERE recipient_id IS NOT NULL;

-- Drop the old recipient_id column and its index
DROP INDEX IF EXISTS idx_accomplishment_comments_recipient;
ALTER TABLE accomplishment_comments DROP COLUMN recipient_id;

-- Add index for array containment queries
CREATE INDEX idx_accomplishment_comments_visible_to 
  ON accomplishment_comments USING GIN (visible_to) 
  WHERE visible_to IS NOT NULL;

-- ============================================
-- 3. CREATE NEW RLS POLICIES
-- ============================================

-- New SELECT policy: Handle both public and private comments with array
CREATE POLICY "View comments in chain"
  ON accomplishment_comments FOR SELECT
  USING (
    -- Private comment logic: only author and users in visible_to array can see
    CASE WHEN visible_to IS NOT NULL AND array_length(visible_to, 1) > 0 THEN
      author_id = auth.uid() OR auth.uid() = ANY(visible_to)
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

-- INSERT policy to validate visible_to users are in chain

CREATE POLICY "Insert comments in chain"
  ON accomplishment_comments FOR INSERT
  WITH CHECK (
    -- Author must be the current user
    author_id = auth.uid()
    AND
    -- Must be in the chain of supervision
    is_in_accomplishment_chain(accomplishment_id, auth.uid())
    AND
    -- If private comment, all visible_to users must be in chain or be the owner
    (
      visible_to IS NULL
      OR
      array_length(visible_to, 1) IS NULL
      OR
      -- All users in visible_to must be valid
      NOT EXISTS (
        SELECT 1 FROM unnest(visible_to) AS vt(user_id)
        WHERE NOT (
          -- User is in the chain
          is_in_accomplishment_chain(accomplishment_id, vt.user_id)
          OR
          -- User is the accomplishment owner
          vt.user_id IN (
            SELECT a.user_id FROM accomplishments a WHERE a.id = accomplishment_id
            UNION
            SELECT a.created_by FROM accomplishments a WHERE a.id = accomplishment_id
          )
        )
      )
    )
  );

-- ============================================
-- 4. UPDATE COMMENT COUNTS FUNCTION
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
      -- Public comments: no visible_to set
      c.visible_to IS NULL OR array_length(c.visible_to, 1) IS NULL
      OR
      -- Private comments: user is author or in visible_to array
      c.author_id = auth.uid()
      OR
      auth.uid() = ANY(c.visible_to)
    )
  GROUP BY c.accomplishment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_accomplishment_comment_counts TO authenticated;


