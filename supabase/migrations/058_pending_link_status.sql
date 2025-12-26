-- Add pending_link status for managed members
-- This status indicates the managed member has been created for an existing user
-- who hasn't yet accepted the supervisor link

-- Update the check constraint to include new status
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_member_status_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_member_status_check 
  CHECK (member_status IN ('active', 'prior_subordinate', 'archived', 'pending_link'));


