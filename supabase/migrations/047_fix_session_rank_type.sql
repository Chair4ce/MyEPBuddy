-- Fix the get_section_active_session function to cast rank to TEXT
-- The rank column is of type user_rank (enum), not TEXT

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
    p.rank::TEXT AS host_rank,  -- Cast enum to TEXT
    (s.host_user_id = p_user_id) AS is_own_session,
    (SELECT COUNT(*)::INT FROM epb_section_editing_participants ep
     WHERE ep.session_id = s.id AND ep.left_at IS NULL) AS participant_count
  FROM epb_section_editing_sessions s
  JOIN profiles p ON p.id = s.host_user_id
  WHERE s.section_id = p_section_id
    AND s.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

