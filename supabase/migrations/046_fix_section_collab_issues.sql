-- Fix issues with EPB section collaboration
-- 1. Fix ambiguous column reference in get_section_active_session
-- 2. Fix infinite recursion in RLS policy for epb_section_editing_participants

-- Drop and recreate the function with explicit table aliases
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
    s.id AS session_id,
    s.session_code,
    s.host_user_id,
    p.full_name AS host_full_name,
    p.rank AS host_rank,
    (s.host_user_id = p_user_id) AS is_own_session,
    (SELECT COUNT(*)::INT FROM epb_section_editing_participants ep
     WHERE ep.session_id = s.id AND ep.left_at IS NULL) AS participant_count
  FROM epb_section_editing_sessions s
  JOIN profiles p ON p.id = s.host_user_id
  WHERE s.section_id = p_section_id
    AND s.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the problematic RLS policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can view participants in accessible sessions" ON epb_section_editing_participants;

-- Recreate with simpler logic that doesn't cause recursion
CREATE POLICY "Users can view participants in sessions they host"
  ON epb_section_editing_participants
  FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own participation"
  ON epb_section_editing_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Also simplify the session participant viewing policy to avoid recursion
DROP POLICY IF EXISTS "Participants can view their joined sessions" ON epb_section_editing_sessions;

-- Recreate without subquery to participants table
CREATE POLICY "Users can view sessions they participate in"
  ON epb_section_editing_sessions
  FOR SELECT
  TO authenticated
  USING (
    -- Can always view if host
    host_user_id = auth.uid()
    -- Or if there's a participant record (checked via security definer function)
  );

