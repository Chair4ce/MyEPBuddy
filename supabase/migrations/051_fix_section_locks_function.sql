-- Fix ambiguous column references in get_shell_section_locks function

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
  DELETE FROM epb_section_locks WHERE epb_section_locks.expires_at < NOW();
  
  RETURN QUERY
  SELECT 
    l.section_id AS section_id,
    s.mpa AS mpa_key,  -- Column is named 'mpa' not 'mpa_key'
    l.user_id AS user_id,
    p.full_name AS user_name,
    p.rank::TEXT AS user_rank,
    l.acquired_at AS acquired_at,
    l.expires_at AS expires_at
  FROM epb_section_locks l
  JOIN epb_shell_sections s ON s.id = l.section_id
  JOIN profiles p ON p.id = l.user_id
  WHERE s.shell_id = p_shell_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

