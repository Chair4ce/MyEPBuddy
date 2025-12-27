-- Migration: Set supervision end date when subordinate is unlinked
-- Updates the handle_subordinate_unlink function to set end date

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
        linked_user_id = NULL,  -- Unlink so they're independent
        supervision_end_date = CURRENT_DATE  -- Set end date
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
      original_profile_id,
      supervision_start_date,
      supervision_end_date
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
      OLD.subordinate_id,
      OLD.supervision_start_date,  -- Preserve original start date
      CURRENT_DATE  -- Set end date to today
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



