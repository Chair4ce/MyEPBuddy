-- Fix infinite recursion in team_members RLS policy
-- The previous policy referenced team_members within itself, causing recursion

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can modify their created team members" ON team_members;
DROP POLICY IF EXISTS "Users can view team members in their chain" ON team_members;

-- Create a helper function to check if a user can view a team member
-- This uses SECURITY DEFINER to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION can_view_team_member(
  tm_supervisor_id UUID,
  tm_parent_profile_id UUID,
  tm_parent_team_member_id UUID,
  tm_linked_user_id UUID,
  viewer_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  parent_member_supervisor UUID;
BEGIN
  -- Direct ownership
  IF tm_supervisor_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Reports directly to viewer
  IF tm_parent_profile_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Viewer is linked to this record
  IF tm_linked_user_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Created by someone viewer supervises (rolling up)
  IF EXISTS (
    SELECT 1 FROM get_subordinate_chain(viewer_id) sc
    WHERE sc.subordinate_id = tm_supervisor_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Reports to someone viewer supervises
  IF tm_parent_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM get_subordinate_chain(viewer_id) sc
    WHERE sc.subordinate_id = tm_parent_profile_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Parent is a managed member - check if viewer created that parent OR supervises the parent's creator
  IF tm_parent_team_member_id IS NOT NULL THEN
    SELECT supervisor_id INTO parent_member_supervisor
    FROM team_members
    WHERE id = tm_parent_team_member_id;
    
    IF parent_member_supervisor = viewer_id THEN
      RETURN TRUE;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM get_subordinate_chain(viewer_id) sc
      WHERE sc.subordinate_id = parent_member_supervisor
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_view_team_member(UUID, UUID, UUID, UUID, UUID) TO authenticated;

-- Simple policy for INSERT/UPDATE/DELETE: Only the creator can modify
CREATE POLICY "Users can modify their created team members"
  ON team_members FOR ALL
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

-- Policy for SELECT uses the helper function to avoid recursion
CREATE POLICY "Users can view team members in their chain"
  ON team_members FOR SELECT
  USING (
    can_view_team_member(
      supervisor_id,
      parent_profile_id,
      parent_team_member_id,
      linked_user_id,
      auth.uid()
    )
  );


