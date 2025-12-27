-- Fix RLS on teams table to allow chain visibility
-- Currently, users can only see teams where they are directly supervisor or subordinate
-- We need to allow users to see teams for their entire subordinate chain

-- Drop the restrictive SELECT policies
DROP POLICY IF EXISTS "Supervisors can view own team" ON teams;
DROP POLICY IF EXISTS "Subordinates can view own team membership" ON teams;

-- Create a more permissive SELECT policy that allows chain visibility
-- Users can see teams where:
-- 1. They are the supervisor
-- 2. They are the subordinate
-- 3. The supervisor is in their subordinate chain (allowing them to see their subordinates' teams)
CREATE POLICY "Users can view teams in their chain"
  ON teams FOR SELECT
  USING (
    supervisor_id = auth.uid() 
    OR subordinate_id = auth.uid()
    OR supervisor_id IN (SELECT subordinate_id FROM get_subordinate_chain(auth.uid()))
  );



