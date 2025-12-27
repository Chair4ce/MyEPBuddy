-- Migration: Create pending link when supervisor updates a managed member's email to match an existing user
-- This allows supervisors to retroactively add emails and trigger the linking process

-- Function to create a pending link for an existing user
-- Called when a supervisor updates a team member's email and it matches an existing profile
CREATE OR REPLACE FUNCTION create_pending_link_for_existing_user(
  p_team_member_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_member RECORD;
  v_existing_link RECORD;
  v_link_id UUID;
BEGIN
  -- Verify the team member belongs to the calling supervisor
  SELECT id, supervisor_id, linked_user_id, email, full_name
  INTO v_team_member
  FROM team_members
  WHERE id = p_team_member_id
    AND supervisor_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  -- Check if the team member is already linked
  IF v_team_member.linked_user_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Team member is already linked to an account'
    );
  END IF;

  -- Check for existing pending link
  SELECT id, status INTO v_existing_link
  FROM pending_managed_links
  WHERE team_member_id = p_team_member_id
    AND user_id = p_user_id;

  IF FOUND THEN
    -- If there's an existing rejected link, we can reactivate it
    IF v_existing_link.status = 'rejected' THEN
      UPDATE pending_managed_links
      SET status = 'pending',
          responded_at = NULL,
          data_synced = false,
          supervisor_accepted = false,
          created_at = now()
      WHERE id = v_existing_link.id
      RETURNING id INTO v_link_id;

      RETURN json_build_object(
        'success', true,
        'message', 'Link request reactivated',
        'link_id', v_link_id
      );
    ELSE
      -- Already pending or accepted
      RETURN json_build_object(
        'success', false,
        'message', 'A link request already exists for this user'
      );
    END IF;
  END IF;

  -- Create new pending link
  INSERT INTO pending_managed_links (user_id, team_member_id)
  VALUES (p_user_id, p_team_member_id)
  RETURNING id INTO v_link_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Link request created',
    'link_id', v_link_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_pending_link_for_existing_user(UUID, UUID) TO authenticated;

-- Also create a trigger that automatically creates pending links when email is updated on team_members
-- This handles the case where the supervisor updates the email to match an existing user
CREATE OR REPLACE FUNCTION check_team_member_email_for_existing_user()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_user_id UUID;
BEGIN
  -- Only trigger on email changes
  IF OLD.email IS DISTINCT FROM NEW.email AND NEW.email IS NOT NULL THEN
    -- Check if a profile exists with this email
    SELECT id INTO v_existing_user_id
    FROM profiles
    WHERE email = NEW.email
      AND id != COALESCE(NEW.linked_user_id, '00000000-0000-0000-0000-000000000000');

    IF v_existing_user_id IS NOT NULL THEN
      -- Create a pending link (ignore conflicts)
      INSERT INTO pending_managed_links (user_id, team_member_id)
      VALUES (v_existing_user_id, NEW.id)
      ON CONFLICT (user_id, team_member_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_check_team_member_email ON team_members;

-- Create the trigger
CREATE TRIGGER trigger_check_team_member_email
  AFTER UPDATE OF email ON team_members
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email AND NEW.email IS NOT NULL)
  EXECUTE FUNCTION check_team_member_email_for_existing_user();



