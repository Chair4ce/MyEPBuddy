-- Fix teams insert policy to allow subordinates to accept requests
-- When a subordinate accepts a supervision request, they need to be able to insert the team record

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Supervisors can add subordinates" ON teams;

-- Allow both supervisors and subordinates to create team relationships
-- Supervisor can add themselves as supervisor
-- Subordinate can add themselves as subordinate (when accepting a request)
CREATE POLICY "Users can create team relationships they're part of"
  ON teams FOR INSERT
  WITH CHECK (
    supervisor_id = auth.uid() OR subordinate_id = auth.uid()
  );

-- Also allow both parties to delete the relationship
DROP POLICY IF EXISTS "Supervisors can remove subordinates" ON teams;

CREATE POLICY "Users can remove team relationships they're part of"
  ON teams FOR DELETE
  USING (
    supervisor_id = auth.uid() OR subordinate_id = auth.uid()
  );



