-- Workspace Collaboration Sessions
-- Enables real-time collaborative editing of statements

-- Table to store active collaboration sessions
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_code VARCHAR(8) NOT NULL UNIQUE, -- Short shareable code
  workspace_state JSONB DEFAULT '{}', -- Current state of the workspace
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours') -- Auto-expire after 24 hours
);

-- Table to track participants in a session
CREATE TABLE IF NOT EXISTS workspace_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES workspace_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ, -- NULL if still active
  is_host BOOLEAN DEFAULT false,
  UNIQUE(session_id, user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_host ON workspace_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_code ON workspace_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_active ON workspace_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workspace_participants_session ON workspace_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_workspace_participants_user ON workspace_session_participants(user_id);

-- Function to generate a unique session code
CREATE OR REPLACE FUNCTION generate_session_code()
RETURNS VARCHAR(8) AS $$
DECLARE
  chars VARCHAR := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars like 0/O, 1/I
  result VARCHAR := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate session code
CREATE OR REPLACE FUNCTION set_session_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := generate_session_code();
    SELECT EXISTS(SELECT 1 FROM workspace_sessions WHERE session_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.session_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_session_code
  BEFORE INSERT ON workspace_sessions
  FOR EACH ROW
  WHEN (NEW.session_code IS NULL OR NEW.session_code = '')
  EXECUTE FUNCTION set_session_code();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workspace_session_timestamp
  BEFORE UPDATE ON workspace_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_session_timestamp();

-- RLS Policies
ALTER TABLE workspace_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_session_participants ENABLE ROW LEVEL SECURITY;

-- Sessions: Host can do everything, participants can read
CREATE POLICY "Host can manage their sessions"
  ON workspace_sessions
  FOR ALL
  TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Participants can view sessions they joined"
  ON workspace_sessions
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT session_id FROM workspace_session_participants 
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

-- Participants: Users can see and manage their own participation
CREATE POLICY "Users can view participants in their sessions"
  ON workspace_session_participants
  FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM workspace_sessions WHERE host_user_id = auth.uid()
    )
    OR session_id IN (
      SELECT session_id FROM workspace_session_participants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join sessions"
  ON workspace_session_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave sessions"
  ON workspace_session_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Host can remove participants"
  ON workspace_session_participants
  FOR DELETE
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM workspace_sessions WHERE host_user_id = auth.uid()
    )
  );

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_session_participants;





