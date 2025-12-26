-- When a team relationship is created (user accepts supervisor request),
-- check if there's a pending_link managed member and link it

CREATE OR REPLACE FUNCTION link_pending_managed_member_on_team_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subordinate profiles%ROWTYPE;
  v_pending_member team_members%ROWTYPE;
BEGIN
  -- Get the subordinate's profile (the person who accepted the request)
  SELECT * INTO v_subordinate FROM profiles WHERE id = NEW.subordinate_id;
  
  IF v_subordinate IS NULL OR v_subordinate.email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if there's a pending_link managed member with matching email
  -- created by the supervisor
  SELECT * INTO v_pending_member
  FROM team_members
  WHERE supervisor_id = NEW.supervisor_id
    AND LOWER(email) = LOWER(v_subordinate.email)
    AND member_status = 'pending_link'
  LIMIT 1;
  
  IF v_pending_member IS NOT NULL THEN
    -- Link the managed member to the user
    UPDATE team_members
    SET 
      linked_user_id = NEW.subordinate_id,
      is_placeholder = false,
      member_status = 'active'
    WHERE id = v_pending_member.id;
    
    -- Migrate any entries created for this managed member to the user
    UPDATE accomplishments
    SET user_id = NEW.subordinate_id
    WHERE team_member_id = v_pending_member.id
      AND user_id != NEW.subordinate_id;
    
    -- Migrate any statements
    UPDATE refined_statements
    SET user_id = NEW.subordinate_id
    WHERE team_member_id = v_pending_member.id
      AND user_id != NEW.subordinate_id;
    
    -- Update statement history
    UPDATE statement_history
    SET ratee_id = NEW.subordinate_id
    WHERE team_member_id = v_pending_member.id
      AND ratee_id != NEW.subordinate_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on teams table
DROP TRIGGER IF EXISTS trigger_link_pending_managed_on_team_create ON teams;
CREATE TRIGGER trigger_link_pending_managed_on_team_create
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION link_pending_managed_member_on_team_create();


