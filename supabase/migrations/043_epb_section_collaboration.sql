-- EPB Shell Section Collaboration
-- Enables real-time collaborative editing per MPA section with soft-locking

-- Table to track active editing sessions per MPA section
CREATE TABLE IF NOT EXISTS epb_section_editing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES epb_shell_sections(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_code VARCHAR(8) NOT NULL UNIQUE, -- Short shareable code for joining
  workspace_state JSONB DEFAULT '{}', -- Current editing state (draft, cursor position, etc.)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(), -- Track when last edit happened
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours'), -- Auto-expire after 2 hours of inactivity
  UNIQUE(section_id, is_active) -- Only one active session per section
);

-- Table to track participants in a section editing session
CREATE TABLE IF NOT EXISTS epb_section_editing_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES epb_section_editing_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ, -- NULL if still active
  is_host BOOLEAN DEFAULT false,
  UNIQUE(session_id, user_id)
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_epb_section_sessions_section ON epb_section_editing_sessions(section_id);
CREATE INDEX IF NOT EXISTS idx_epb_section_sessions_host ON epb_section_editing_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_epb_section_sessions_code ON epb_section_editing_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_epb_section_sessions_active ON epb_section_editing_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_epb_section_participants_session ON epb_section_editing_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_epb_section_participants_user ON epb_section_editing_participants(user_id);

-- Reuse the session code generator from workspace_sessions
-- (Already exists from migration 020)

-- Trigger to auto-generate session code for section editing sessions
CREATE OR REPLACE FUNCTION set_section_session_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := generate_session_code();
    -- Check both workspace_sessions and epb_section_editing_sessions for uniqueness
    SELECT EXISTS(
      SELECT 1 FROM workspace_sessions WHERE session_code = new_code
      UNION
      SELECT 1 FROM epb_section_editing_sessions WHERE session_code = new_code
    ) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.session_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_section_session_code
  BEFORE INSERT ON epb_section_editing_sessions
  FOR EACH ROW
  WHEN (NEW.session_code IS NULL OR NEW.session_code = '')
  EXECUTE FUNCTION set_section_session_code();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_section_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.last_activity_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_section_session_timestamp
  BEFORE UPDATE ON epb_section_editing_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_section_session_timestamp();

-- Function to clean up stale sessions (called periodically or on query)
CREATE OR REPLACE FUNCTION cleanup_stale_section_sessions()
RETURNS void AS $$
BEGIN
  -- Deactivate sessions that have expired or been inactive for > 30 minutes
  UPDATE epb_section_editing_sessions
  SET is_active = false
  WHERE is_active = true
    AND (expires_at < NOW() OR last_activity_at < NOW() - INTERVAL '30 minutes');
END;
$$ LANGUAGE plpgsql;

-- Function to check if a section is being edited by someone else
CREATE OR REPLACE FUNCTION get_section_active_session(p_section_id UUID, p_user_id UUID)
RETURNS TABLE (
  session_id UUID,
  session_code VARCHAR(8),
  host_user_id UUID,
  host_full_name TEXT,
  host_rank TEXT,
  is_own_session BOOLEAN,
  participant_count INT
) AS $$
BEGIN
  -- First clean up stale sessions
  PERFORM cleanup_stale_section_sessions();
  
  RETURN QUERY
  SELECT 
    s.id,
    s.session_code,
    s.host_user_id,
    p.full_name,
    p.rank,
    (s.host_user_id = p_user_id),
    (SELECT COUNT(*)::INT FROM epb_section_editing_participants 
     WHERE session_id = s.id AND left_at IS NULL)
  FROM epb_section_editing_sessions s
  JOIN profiles p ON p.id = s.host_user_id
  WHERE s.section_id = p_section_id
    AND s.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE epb_section_editing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE epb_section_editing_participants ENABLE ROW LEVEL SECURITY;

-- Sessions: Anyone authenticated can view session existence
-- (Detailed EPB shell access is controlled at the shell level)
CREATE POLICY "Authenticated users can view editing sessions"
  ON epb_section_editing_sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- Host can manage their sessions
CREATE POLICY "Host can manage their section sessions"
  ON epb_section_editing_sessions
  FOR ALL
  TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

-- Participants can view sessions they joined
CREATE POLICY "Participants can view their joined sessions"
  ON epb_section_editing_sessions
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT session_id FROM epb_section_editing_participants 
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

-- Participant policies
CREATE POLICY "Users can view participants in accessible sessions"
  ON epb_section_editing_participants
  FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = auth.uid()
    )
    OR session_id IN (
      SELECT session_id FROM epb_section_editing_participants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join sessions"
  ON epb_section_editing_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave sessions"
  ON epb_section_editing_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Host can remove participants"
  ON epb_section_editing_participants
  FOR DELETE
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = auth.uid()
    )
  );

-- Enable Realtime for collaborative editing
ALTER PUBLICATION supabase_realtime ADD TABLE epb_section_editing_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE epb_section_editing_participants;

