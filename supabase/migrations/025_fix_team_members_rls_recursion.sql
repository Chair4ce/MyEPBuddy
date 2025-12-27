-- Fix infinite recursion in team_members RLS policy
-- The previous policy referenced team_members in its own check, causing recursion

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view managed members in their chain" ON team_members;
DROP POLICY IF EXISTS "Parent users can view managed members under them" ON team_members;
DROP POLICY IF EXISTS "Supervisors can manage their team members" ON team_members;

-- Simplified policy: users can see and manage team_members they created (supervisor_id)
-- This avoids recursion by only checking supervisor_id
CREATE POLICY "Users can manage their created team members"
  ON team_members FOR ALL
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

-- For SELECT, also allow viewing if the member reports to you directly (profile parent)
-- or if you're in the subordinate chain of the supervisor
CREATE POLICY "Users can view team members reporting to them"
  ON team_members FOR SELECT
  USING (
    parent_profile_id = auth.uid()  -- Reports directly to me
    OR supervisor_id IN (  -- Created by someone I supervise
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );



