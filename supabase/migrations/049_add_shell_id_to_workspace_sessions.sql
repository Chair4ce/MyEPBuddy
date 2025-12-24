-- Add shell_id to workspace_sessions for EPB collaboration
-- This allows us to find active sessions for a specific EPB shell

-- Add the column
ALTER TABLE workspace_sessions 
ADD COLUMN IF NOT EXISTS shell_id UUID REFERENCES epb_shells(id) ON DELETE CASCADE;

-- Create index for looking up sessions by shell
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_shell ON workspace_sessions(shell_id) WHERE shell_id IS NOT NULL;

-- Function to check if user has access to an EPB shell
CREATE OR REPLACE FUNCTION public.user_can_access_shell(p_shell_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is owner, creator, supervisor, or has been shared
  RETURN EXISTS (
    SELECT 1 FROM epb_shells WHERE id = p_shell_id AND (user_id = p_user_id OR created_by = p_user_id)
  ) OR EXISTS (
    SELECT 1 FROM epb_shells s
    JOIN teams t ON t.user_id = s.user_id
    WHERE s.id = p_shell_id AND t.supervisor_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM epb_shell_shares WHERE shell_id = p_shell_id AND shared_with_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS to allow users with EPB access to find sessions
-- Users with access to an EPB shell can see sessions for that shell
CREATE POLICY "Users can view sessions for accessible shells"
  ON workspace_sessions
  FOR SELECT
  TO authenticated
  USING (
    shell_id IS NULL -- Non-EPB sessions (original behavior)
    OR user_can_access_shell(shell_id, auth.uid())
  );

