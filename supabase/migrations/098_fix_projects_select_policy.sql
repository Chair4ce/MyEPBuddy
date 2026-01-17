-- Fix: Allow project creators to view their projects immediately after creation
-- The previous SELECT policy required the user to be a project member, but the trigger
-- that adds them as a member runs AFTER the insert, causing the .select() to fail.

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Members can view their projects" ON projects;

-- Create updated SELECT policy that allows both members AND creators to view
CREATE POLICY "Members and creators can view projects"
  ON projects FOR SELECT
  USING (
    -- Creator can always see their project
    created_by = (SELECT auth.uid())
    OR
    -- Members can see their projects
    is_project_member(id, (SELECT auth.uid()))
  );
