-- Allow managed members to have other managed members as parents (nested tree)
-- Either parent_profile_id OR parent_team_member_id should be set, not both

-- Make parent_profile_id nullable since parent could be a team_member instead
ALTER TABLE team_members ALTER COLUMN parent_profile_id DROP NOT NULL;

-- Add parent_team_member_id for nesting managed members under other managed members
ALTER TABLE team_members 
ADD COLUMN parent_team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;

-- Index for efficient tree queries
CREATE INDEX idx_team_members_parent_member ON team_members(parent_team_member_id);

-- Add constraint: exactly one parent type must be set
ALTER TABLE team_members 
ADD CONSTRAINT chk_one_parent CHECK (
  (parent_profile_id IS NOT NULL AND parent_team_member_id IS NULL) OR
  (parent_profile_id IS NULL AND parent_team_member_id IS NOT NULL)
);

-- Update the RLS policy to also check parent_team_member_id chain
DROP POLICY IF EXISTS "Users can view managed members in their chain" ON team_members;
CREATE POLICY "Users can view managed members in their chain"
  ON team_members FOR SELECT
  USING (
    supervisor_id = auth.uid()  -- Created by me
    OR parent_profile_id = auth.uid()  -- Reports to me directly
    OR parent_profile_id IN (  -- Reports to a real profile in my chain
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
    -- Nested under managed members I can see (recursive check via supervisor_id ownership)
    OR parent_team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
  );

-- Recursive function to get all managed members in a tree (including nested ones)
CREATE OR REPLACE FUNCTION get_all_managed_members(supervisor_uuid UUID)
RETURNS TABLE(
  id UUID,
  supervisor_id UUID,
  parent_profile_id UUID,
  parent_team_member_id UUID,
  linked_user_id UUID,
  full_name TEXT,
  email TEXT,
  rank user_rank,
  afsc TEXT,
  unit TEXT,
  is_placeholder BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE member_tree AS (
    -- Base case: members created by this supervisor
    SELECT tm.*
    FROM team_members tm
    WHERE tm.supervisor_id = supervisor_uuid
    
    UNION ALL
    
    -- Recursive case: members under members we already have
    SELECT child.*
    FROM team_members child
    JOIN member_tree parent ON child.parent_team_member_id = parent.id
  )
  SELECT DISTINCT * FROM member_tree;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_managed_members(UUID) TO authenticated;

