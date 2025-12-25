-- Migration: Chain-Based Managed Member Visibility
-- Allows managed members to cascade DOWN to their assigned parent (who this member reports to)
-- and roll UP to supervisors in the chain (who supervise the creator)
-- 
-- Example scenarios:
-- 1. MSgt creates a managed member that reports to TSgt → TSgt should see it
-- 2. TSgt creates a managed member → MSgt (TSgt's supervisor) should also see it
-- 3. MSgt creates a managed member that reports to their own managed member → still visible to MSgt

-- Function to get all managed members visible to a user
-- Returns members where:
--   1. User created them (supervisor_id = user)
--   2. User is the direct parent (parent_profile_id = user)  
--   3. Created by someone the user supervises (supervisor_id in user's subordinate chain)
--   4. Parent is someone the user supervises (parent_profile_id in user's subordinate chain)
CREATE OR REPLACE FUNCTION get_visible_managed_members(viewer_uuid UUID)
RETURNS TABLE(
  id UUID,
  supervisor_id UUID,
  parent_profile_id UUID,
  parent_team_member_id UUID,
  linked_user_id UUID,
  original_profile_id UUID,
  full_name TEXT,
  email TEXT,
  rank user_rank,
  afsc TEXT,
  unit TEXT,
  is_placeholder BOOLEAN,
  member_status TEXT,
  supervision_start_date DATE,
  supervision_end_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
    -- Get the user's subordinate chain (all people they supervise, directly or indirectly)
    subordinate_chain AS (
      SELECT subordinate_id FROM get_subordinate_chain(viewer_uuid)
    ),
    -- Get all managed members in the tree, starting from those created by viewer or their subordinates
    all_visible AS (
      -- Direct ownership: created by the viewer
      SELECT tm.*
      FROM team_members tm
      WHERE tm.supervisor_id = viewer_uuid
      
      UNION
      
      -- Reports to viewer directly
      SELECT tm.*
      FROM team_members tm
      WHERE tm.parent_profile_id = viewer_uuid
      
      UNION
      
      -- Created by someone in viewer's subordinate chain (rolling up)
      SELECT tm.*
      FROM team_members tm
      WHERE tm.supervisor_id IN (SELECT subordinate_id FROM subordinate_chain)
      
      UNION
      
      -- Reports to someone in viewer's subordinate chain
      SELECT tm.*
      FROM team_members tm
      WHERE tm.parent_profile_id IN (SELECT subordinate_id FROM subordinate_chain)
    ),
    -- Now we need to also include any nested managed members (children of visible managed members)
    with_nested AS (
      SELECT * FROM all_visible
      
      UNION ALL
      
      -- Recursively get children of managed members
      SELECT child.*
      FROM team_members child
      JOIN with_nested parent ON child.parent_team_member_id = parent.id
    )
  SELECT DISTINCT 
    wn.id,
    wn.supervisor_id,
    wn.parent_profile_id,
    wn.parent_team_member_id,
    wn.linked_user_id,
    wn.original_profile_id,
    wn.full_name,
    wn.email,
    wn.rank,
    wn.afsc,
    wn.unit,
    wn.is_placeholder,
    wn.member_status,
    wn.supervision_start_date,
    wn.supervision_end_date,
    wn.created_at,
    wn.updated_at
  FROM with_nested wn;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_visible_managed_members(UUID) TO authenticated;

-- Update RLS policies for team_members to support chain visibility
-- Drop existing SELECT policies first
DROP POLICY IF EXISTS "Users can manage their created team members" ON team_members;
DROP POLICY IF EXISTS "Users can view team members reporting to them" ON team_members;
DROP POLICY IF EXISTS "Linked users can view their team member record" ON team_members;

-- Policy for INSERT/UPDATE/DELETE: Only the creator (supervisor_id) can modify
CREATE POLICY "Users can modify their created team members"
  ON team_members FOR ALL
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

-- Policy for SELECT: Can view if it's in their visible set
-- We use a simpler check here to avoid calling the function in RLS (performance)
-- The function will be used for querying, RLS just ensures basic access
CREATE POLICY "Users can view team members in their chain"
  ON team_members FOR SELECT
  USING (
    -- Created by me
    supervisor_id = auth.uid()
    -- Reports directly to me
    OR parent_profile_id = auth.uid()
    -- I'm linked to this record
    OR linked_user_id = auth.uid()
    -- Created by someone I supervise (rolling up)
    OR supervisor_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
    -- Reports to someone I supervise
    OR parent_profile_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
    -- Parent is a managed member created by me (nested case)
    OR parent_team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    -- Parent is a managed member created by someone I supervise
    OR parent_team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.supervisor_id IN (
        SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
      )
    )
  );

-- Update accomplishments RLS to allow supervisors in chain to view/manage entries
-- First, drop existing chain-related policies to avoid conflicts
DROP POLICY IF EXISTS "Supervisors can view managed member accomplishments" ON accomplishments;
DROP POLICY IF EXISTS "Parent users can view managed member accomplishments" ON accomplishments;

-- Unified policy for viewing managed member accomplishments
CREATE POLICY "Chain can view managed member accomplishments"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Update refined_statements RLS similarly
DROP POLICY IF EXISTS "Supervisors can view managed member refined statements" ON refined_statements;
DROP POLICY IF EXISTS "Parent users can view managed member refined statements" ON refined_statements;

CREATE POLICY "Chain can view managed member refined statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Allow INSERT on accomplishments for visible managed members
DROP POLICY IF EXISTS "Supervisors can insert managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can insert managed member accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    -- Own accomplishment
    user_id = auth.uid()
    OR created_by = auth.uid()
    -- For a visible managed member
    OR team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Allow UPDATE on accomplishments for visible managed members  
DROP POLICY IF EXISTS "Supervisors can update managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can update managed member accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    user_id = auth.uid()
    OR team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Allow DELETE on accomplishments for visible managed members
DROP POLICY IF EXISTS "Supervisors can delete managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can delete managed member accomplishments"
  ON accomplishments FOR DELETE
  USING (
    user_id = auth.uid()
    OR team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Allow INSERT on refined_statements for visible managed members
DROP POLICY IF EXISTS "Supervisors can insert managed member refined statements" ON refined_statements;
CREATE POLICY "Chain can insert managed member refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );

-- Allow UPDATE on refined_statements for visible managed members
DROP POLICY IF EXISTS "Supervisors can update managed member refined statements" ON refined_statements;
CREATE POLICY "Chain can update managed member refined statements"
  ON refined_statements FOR UPDATE
  USING (
    user_id = auth.uid()
    OR team_member_id IN (
      SELECT id FROM get_visible_managed_members(auth.uid())
    )
  );


