-- EPB Collaboration Modes
-- Supports two modes:
-- 1. Multi-User Mode: Real-time collaboration with cursors
-- 2. Normal Mode: Per-MPA section locking

-- Add multi_user_enabled toggle to epb_shells
ALTER TABLE epb_shells 
ADD COLUMN IF NOT EXISTS multi_user_enabled BOOLEAN DEFAULT false;

-- Table to track per-MPA section locks (for Normal Mode)
-- When a user enters edit mode on an MPA, they acquire a lock
CREATE TABLE IF NOT EXISTS epb_section_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES epb_shell_sections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  -- Locks expire after 5 minutes of inactivity (heartbeat required)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  UNIQUE(section_id) -- Only one lock per section
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_section_locks_section ON epb_section_locks(section_id);
CREATE INDEX IF NOT EXISTS idx_section_locks_user ON epb_section_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_section_locks_expires ON epb_section_locks(expires_at);

-- Function to acquire a lock on an MPA section
CREATE OR REPLACE FUNCTION acquire_section_lock(p_section_id UUID, p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  locked_by_name TEXT,
  locked_by_rank TEXT
) AS $$
DECLARE
  v_existing_lock epb_section_locks%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  -- Clean up expired locks first
  DELETE FROM epb_section_locks WHERE expires_at < NOW();
  
  -- Check for existing lock
  SELECT * INTO v_existing_lock 
  FROM epb_section_locks 
  WHERE section_id = p_section_id;
  
  IF v_existing_lock.id IS NOT NULL THEN
    -- Lock exists
    IF v_existing_lock.user_id = p_user_id THEN
      -- User already has the lock, refresh it
      UPDATE epb_section_locks 
      SET expires_at = NOW() + INTERVAL '5 minutes'
      WHERE id = v_existing_lock.id;
      
      RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT;
    ELSE
      -- Someone else has the lock
      SELECT * INTO v_profile FROM profiles WHERE id = v_existing_lock.user_id;
      RETURN QUERY SELECT false, v_profile.full_name, v_profile.rank::TEXT;
    END IF;
  ELSE
    -- No lock exists, acquire it
    INSERT INTO epb_section_locks (section_id, user_id)
    VALUES (p_section_id, p_user_id);
    
    RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release a lock
CREATE OR REPLACE FUNCTION release_section_lock(p_section_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM epb_section_locks 
  WHERE section_id = p_section_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh a lock (heartbeat)
CREATE OR REPLACE FUNCTION refresh_section_lock(p_section_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE epb_section_locks 
  SET expires_at = NOW() + INTERVAL '5 minutes'
  WHERE section_id = p_section_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all locks for an EPB shell
CREATE OR REPLACE FUNCTION get_shell_section_locks(p_shell_id UUID)
RETURNS TABLE (
  section_id UUID,
  mpa_key TEXT,
  user_id UUID,
  user_name TEXT,
  user_rank TEXT,
  acquired_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Clean up expired locks first
  DELETE FROM epb_section_locks WHERE expires_at < NOW();
  
  RETURN QUERY
  SELECT 
    l.section_id,
    s.mpa_key,
    l.user_id,
    p.full_name,
    p.rank::TEXT,
    l.acquired_at,
    l.expires_at
  FROM epb_section_locks l
  JOIN epb_shell_sections s ON s.id = l.section_id
  JOIN profiles p ON p.id = l.user_id
  WHERE s.shell_id = p_shell_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for section locks
ALTER TABLE epb_section_locks ENABLE ROW LEVEL SECURITY;

-- Users can view locks on sections they have access to
CREATE POLICY "Users can view section locks"
  ON epb_section_locks
  FOR SELECT
  TO authenticated
  USING (
    section_id IN (
      SELECT ss.id FROM epb_shell_sections ss
      JOIN epb_shells s ON s.id = ss.shell_id
      WHERE s.user_id = auth.uid() 
        OR s.created_by = auth.uid()
        OR s.id IN (SELECT shell_id FROM epb_shell_shares WHERE shared_with_id = auth.uid())
    )
  );

-- Users can create/update/delete their own locks
CREATE POLICY "Users can manage their own locks"
  ON epb_section_locks
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for locks table
ALTER PUBLICATION supabase_realtime ADD TABLE epb_section_locks;



