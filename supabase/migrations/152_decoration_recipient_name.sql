-- Add recipient_name for decoration shells created for non-account holders
-- Used when team_member_id is null but the decoration is not for the creator themselves

ALTER TABLE decoration_shells
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

COMMENT ON COLUMN decoration_shells.recipient_name IS
  'Manual recipient name for non-account holders when no team_member_id is linked';
