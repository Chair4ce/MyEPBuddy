-- Add approval status to section editing participants
-- Hosts can approve or reject join requests

-- Add status column with pending, approved, rejected states
ALTER TABLE epb_section_editing_participants
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' 
CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add profile info for easier display
ALTER TABLE epb_section_editing_participants
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS rank TEXT;

-- Update existing records (hosts are auto-approved)
UPDATE epb_section_editing_participants 
SET status = 'approved' 
WHERE is_host = true;

-- Function to populate profile info on insert
CREATE OR REPLACE FUNCTION populate_participant_profile()
RETURNS TRIGGER AS $$
BEGIN
  SELECT full_name, rank INTO NEW.full_name, NEW.rank
  FROM profiles WHERE id = NEW.user_id;
  
  -- Auto-approve hosts
  IF NEW.is_host = true THEN
    NEW.status := 'approved';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_populate_participant_profile
  BEFORE INSERT ON epb_section_editing_participants
  FOR EACH ROW
  EXECUTE FUNCTION populate_participant_profile();

-- Policy for hosts to update participant status (approve/reject)
CREATE POLICY "Host can update participant status"
  ON epb_section_editing_participants
  FOR UPDATE
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = auth.uid()
    )
  );

