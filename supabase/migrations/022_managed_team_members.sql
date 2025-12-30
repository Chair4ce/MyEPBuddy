-- Managed Team Members table
-- Allows supervisors to create placeholder subordinates who may not have accounts
-- These can be linked to real users later when they sign up

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Linked when they sign up
  full_name TEXT NOT NULL,
  email TEXT, -- For future linking when they sign up
  rank user_rank,
  afsc TEXT,
  unit TEXT,
  is_placeholder BOOLEAN NOT NULL DEFAULT true, -- True until linked to real user
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_team_members_supervisor ON team_members(supervisor_id);
CREATE INDEX idx_team_members_email ON team_members(email) WHERE email IS NOT NULL;
CREATE INDEX idx_team_members_linked_user ON team_members(linked_user_id) WHERE linked_user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Supervisors can view their own managed team members
CREATE POLICY "Supervisors can view their managed members"
  ON team_members FOR SELECT
  USING (supervisor_id = auth.uid());

-- Supervisors can create managed team members
CREATE POLICY "Supervisors can create managed members"
  ON team_members FOR INSERT
  WITH CHECK (supervisor_id = auth.uid());

-- Supervisors can update their managed team members
CREATE POLICY "Supervisors can update their managed members"
  ON team_members FOR UPDATE
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

-- Supervisors can delete their managed team members
CREATE POLICY "Supervisors can delete their managed members"
  ON team_members FOR DELETE
  USING (supervisor_id = auth.uid());

-- Linked users can view themselves in team_members
CREATE POLICY "Linked users can view their team member record"
  ON team_members FOR SELECT
  USING (linked_user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Allow accomplishments to reference team_members
-- We need to update accomplishments to accept either a profile user_id or a team_member_id
-- Adding a nullable team_member_id column for managed members
ALTER TABLE accomplishments ADD COLUMN team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;

-- Create index for the new column
CREATE INDEX idx_accomplishments_team_member ON accomplishments(team_member_id) WHERE team_member_id IS NOT NULL;

-- Update the accomplishments constraint to allow either user_id (self) or team_member_id (managed)
-- Note: An entry must have at least one of user_id or team_member_id
-- For managed members, user_id will still be set (to the managed member's linked_user_id or supervisor_id for RLS)

-- RLS policy for supervisors to manage entries for their managed members
CREATE POLICY "Supervisors can view managed member accomplishments"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
  );

CREATE POLICY "Supervisors can insert managed member accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "Supervisors can update managed member accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Supervisors can delete managed member accomplishments"
  ON accomplishments FOR DELETE
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Similarly for statement_history and refined_statements
-- Add team_member_id to statement_history
ALTER TABLE statement_history ADD COLUMN team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;
CREATE INDEX idx_statement_history_team_member ON statement_history(team_member_id) WHERE team_member_id IS NOT NULL;

CREATE POLICY "Supervisors can view managed member statement history"
  ON statement_history FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
  );

CREATE POLICY "Supervisors can insert managed member statement history"
  ON statement_history FOR INSERT
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Add team_member_id to refined_statements
ALTER TABLE refined_statements ADD COLUMN team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;
CREATE INDEX idx_refined_statements_team_member ON refined_statements(team_member_id) WHERE team_member_id IS NOT NULL;

CREATE POLICY "Supervisors can view managed member refined statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
  );

CREATE POLICY "Supervisors can insert managed member refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Supervisors can update managed member refined statements"
  ON refined_statements FOR UPDATE
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Function to link a team_member to a real user when they sign up
-- This checks if their email matches any existing team_members
CREATE OR REPLACE FUNCTION link_user_to_team_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Update any team_members with matching email
  UPDATE team_members
  SET 
    linked_user_id = NEW.id,
    is_placeholder = false
  WHERE 
    LOWER(email) = LOWER(NEW.email)
    AND linked_user_id IS NULL
    AND is_placeholder = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run after profile is created
CREATE TRIGGER on_profile_created_link_team_member
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION link_user_to_team_member();

-- Also need to migrate accomplishments for linked users
-- When a user signs up and gets linked, their supervisor-created entries should be visible to them
CREATE OR REPLACE FUNCTION migrate_managed_member_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Update accomplishments to set user_id for linked user
  UPDATE accomplishments
  SET user_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  -- Update statement_history
  UPDATE statement_history
  SET ratee_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  -- Update refined_statements
  UPDATE refined_statements
  SET user_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to migrate data when team_member is linked
CREATE TRIGGER on_team_member_linked
  AFTER UPDATE OF linked_user_id ON team_members
  FOR EACH ROW
  WHEN (OLD.linked_user_id IS NULL AND NEW.linked_user_id IS NOT NULL)
  EXECUTE FUNCTION migrate_managed_member_data();





