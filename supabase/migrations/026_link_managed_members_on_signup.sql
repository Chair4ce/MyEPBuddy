-- Trigger to automatically link managed members when a user signs up with matching email
-- This handles the case where multiple supervisors may have added the same person

-- Function to link managed members by email
CREATE OR REPLACE FUNCTION link_managed_members_by_email()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new profile is created with an email, find and link any matching team_members
  IF NEW.email IS NOT NULL THEN
    UPDATE team_members
    SET 
      linked_user_id = NEW.id,
      is_placeholder = false,
      updated_at = now()
    WHERE 
      email = NEW.email
      AND linked_user_id IS NULL
      AND is_placeholder = true;
    
    -- Log the number of linked members (optional, for debugging)
    -- RAISE NOTICE 'Linked % managed members for user %', FOUND, NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profile insert
DROP TRIGGER IF EXISTS trigger_link_managed_members ON profiles;
CREATE TRIGGER trigger_link_managed_members
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_managed_members_by_email();

-- Also run on profile email update (in case they update their email later)
DROP TRIGGER IF EXISTS trigger_link_managed_members_on_update ON profiles;
CREATE TRIGGER trigger_link_managed_members_on_update
  AFTER UPDATE OF email ON profiles
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email AND NEW.email IS NOT NULL)
  EXECUTE FUNCTION link_managed_members_by_email();

-- Update RLS to allow linked users to see their own managed member records
CREATE POLICY "Linked users can view their team_member records"
  ON team_members FOR SELECT
  USING (linked_user_id = auth.uid());

