-- Migration: Prior Subordinate Retention
-- When a subordinate unlinks, the supervisor retains a managed account copy
-- to preserve access to entries/statements for EPB completion

-- Add status field to track managed member types
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS member_status text DEFAULT 'active' 
  CHECK (member_status IN ('active', 'prior_subordinate', 'archived'));

-- Add original_profile_id to track which real user this came from
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS original_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Function to handle subordinate unlinking
-- Creates a managed member copy for the supervisor to retain data access
CREATE OR REPLACE FUNCTION handle_subordinate_unlink()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subordinate profiles%ROWTYPE;
  v_existing_managed uuid;
  v_new_managed_id uuid;
BEGIN
  -- Get the subordinate's profile info
  SELECT * INTO v_subordinate FROM profiles WHERE id = OLD.subordinate_id;
  
  IF v_subordinate IS NULL THEN
    RETURN OLD;
  END IF;

  -- Check if supervisor already has a managed member for this person
  SELECT id INTO v_existing_managed 
  FROM team_members 
  WHERE supervisor_id = OLD.supervisor_id 
    AND (linked_user_id = OLD.subordinate_id OR original_profile_id = OLD.subordinate_id);

  IF v_existing_managed IS NOT NULL THEN
    -- Update existing managed member to prior_subordinate status
    UPDATE team_members 
    SET member_status = 'prior_subordinate',
        linked_user_id = NULL  -- Unlink so they're independent
    WHERE id = v_existing_managed;
  ELSE
    -- Create new managed member as prior_subordinate
    INSERT INTO team_members (
      supervisor_id,
      parent_profile_id,
      full_name,
      email,
      rank,
      afsc,
      unit,
      is_placeholder,
      member_status,
      original_profile_id
    ) VALUES (
      OLD.supervisor_id,
      OLD.supervisor_id,
      v_subordinate.full_name,
      v_subordinate.email,
      v_subordinate.rank,
      v_subordinate.afsc,
      v_subordinate.unit,
      true,
      'prior_subordinate',
      OLD.subordinate_id
    )
    RETURNING id INTO v_new_managed_id;

    -- Link accomplishments from the real user to this managed member
    -- Only for entries created by the supervisor
    UPDATE accomplishments
    SET team_member_id = v_new_managed_id
    WHERE user_id = OLD.subordinate_id
      AND created_by = OLD.supervisor_id
      AND team_member_id IS NULL;

    -- Link statements from the real user to this managed member
    -- Only for statements created by the supervisor
    UPDATE refined_statements
    SET team_member_id = v_new_managed_id
    WHERE user_id = OLD.subordinate_id
      AND created_by = OLD.supervisor_id
      AND team_member_id IS NULL;
  END IF;

  RETURN OLD;
END;
$$;

-- Create trigger on teams table
DROP TRIGGER IF EXISTS trigger_handle_subordinate_unlink ON teams;
CREATE TRIGGER trigger_handle_subordinate_unlink
  BEFORE DELETE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION handle_subordinate_unlink();

-- Function to archive a prior subordinate managed account
CREATE OR REPLACE FUNCTION archive_prior_subordinate(team_member_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members
  SET member_status = 'archived'
  WHERE id = team_member_id
    AND supervisor_id = auth.uid()
    AND member_status = 'prior_subordinate';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Function to permanently delete a prior subordinate and optionally their data
CREATE OR REPLACE FUNCTION delete_prior_subordinate(
  team_member_id uuid,
  delete_data boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries_deleted int := 0;
  v_statements_deleted int := 0;
BEGIN
  -- Verify ownership and status
  IF NOT EXISTS (
    SELECT 1 FROM team_members 
    WHERE id = team_member_id 
      AND supervisor_id = auth.uid()
      AND member_status IN ('prior_subordinate', 'archived')
  ) THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  IF delete_data THEN
    -- Delete accomplishments
    DELETE FROM accomplishments WHERE team_member_id = team_member_id;
    GET DIAGNOSTICS v_entries_deleted = ROW_COUNT;

    -- Delete statements
    DELETE FROM refined_statements WHERE team_member_id = team_member_id;
    GET DIAGNOSTICS v_statements_deleted = ROW_COUNT;
  END IF;

  -- Delete the managed member
  DELETE FROM team_members WHERE id = team_member_id;

  RETURN json_build_object(
    'success', true,
    'entries_deleted', v_entries_deleted,
    'statements_deleted', v_statements_deleted
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION archive_prior_subordinate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_prior_subordinate(uuid, boolean) TO authenticated;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(member_status);
CREATE INDEX IF NOT EXISTS idx_team_members_original_profile ON team_members(original_profile_id);





