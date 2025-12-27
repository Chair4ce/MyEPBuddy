-- Add parent_profile_id to team_members to specify where in chain they belong
-- This allows managed members to be placed under any real user in the supervisor's chain

ALTER TABLE team_members 
ADD COLUMN parent_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- Default existing records to have supervisor as their parent
UPDATE team_members SET parent_profile_id = supervisor_id WHERE parent_profile_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE team_members ALTER COLUMN parent_profile_id SET NOT NULL;

-- Index for efficient chain queries
CREATE INDEX idx_team_members_parent ON team_members(parent_profile_id);

-- Update RLS: Allow parent users to see managed members under them
CREATE POLICY "Parent users can view managed members under them"
  ON team_members FOR SELECT
  USING (parent_profile_id = auth.uid());

-- Function to get managed members in the subordinate chain
-- This returns all team_members where their parent is in the user's chain
CREATE OR REPLACE FUNCTION get_chain_managed_members(supervisor_uuid UUID)
RETURNS TABLE(
  id UUID,
  supervisor_id UUID,
  parent_profile_id UUID,
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
  SELECT tm.*
  FROM team_members tm
  WHERE 
    -- Direct: parent is the supervisor
    tm.parent_profile_id = supervisor_uuid
    OR
    -- Indirect: parent is in the supervisor's subordinate chain
    tm.parent_profile_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(supervisor_uuid)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_chain_managed_members(UUID) TO authenticated;

-- Allow supervisors to view managed members in their chain (not just ones they created)
DROP POLICY IF EXISTS "Supervisors can view their managed members" ON team_members;
CREATE POLICY "Users can view managed members in their chain"
  ON team_members FOR SELECT
  USING (
    supervisor_id = auth.uid()  -- Created by me
    OR parent_profile_id = auth.uid()  -- Reports to me
    OR parent_profile_id IN (  -- Reports to someone in my chain
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );

-- Also update accomplishments RLS to allow parents to see entries
CREATE POLICY "Parent users can view managed member accomplishments"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE parent_profile_id = auth.uid()
    )
  );

-- And refined_statements
CREATE POLICY "Parent users can view managed member refined statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE parent_profile_id = auth.uid()
    )
  );



