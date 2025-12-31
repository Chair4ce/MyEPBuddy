-- EPB Archive System
-- Allows users to archive their completed EPBs and save all statements to their library
-- Archived EPB statements can be filtered in the library and shared as a collection

-- ============================================
-- ADD STATUS AND ARCHIVE FIELDS TO EPB_SHELLS
-- ============================================
ALTER TABLE epb_shells 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_name TEXT; -- Optional custom name for the archived EPB

-- Index for efficient filtering by status
CREATE INDEX IF NOT EXISTS idx_epb_shells_status ON epb_shells(status);

-- ============================================
-- ADD SOURCE EPB REFERENCE TO REFINED_STATEMENTS
-- ============================================
-- This allows tracking which EPB a statement originated from
ALTER TABLE refined_statements
  ADD COLUMN IF NOT EXISTS source_epb_shell_id UUID REFERENCES epb_shells(id) ON DELETE SET NULL;

-- Index for filtering statements by source EPB
CREATE INDEX IF NOT EXISTS idx_refined_statements_source_epb ON refined_statements(source_epb_shell_id);

-- ============================================
-- ARCHIVE EPB FUNCTION
-- ============================================
-- Archives an EPB and copies all non-empty statements to the user's refined_statements library
-- Returns the count of statements saved
CREATE OR REPLACE FUNCTION archive_epb_shell(
  p_shell_id UUID,
  p_archive_name TEXT DEFAULT NULL,
  p_clear_after_archive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  success BOOLEAN,
  statements_saved INTEGER,
  shell_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_shell RECORD;
  v_section RECORD;
  v_statements_saved INTEGER := 0;
  v_user_id UUID;
  v_team_member_id UUID;
  v_afsc TEXT;
  v_rank TEXT;
BEGIN
  -- Get the shell and validate ownership/access
  SELECT * INTO v_shell
  FROM epb_shells
  WHERE id = p_shell_id
  AND (
    -- Own shell
    (user_id = auth.uid() AND team_member_id IS NULL)
    OR
    -- Supervisor via team history
    (team_member_id IS NULL AND EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id
      AND th.supervisor_id = auth.uid()
    ))
    OR
    -- Managed member
    (team_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    ))
  );

  IF v_shell IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, NULL::UUID, 'Shell not found or access denied';
    RETURN;
  END IF;

  IF v_shell.status = 'archived' THEN
    RETURN QUERY SELECT FALSE, 0, v_shell.id, 'Shell is already archived';
    RETURN;
  END IF;

  -- Get user info for the ratee
  IF v_shell.team_member_id IS NOT NULL THEN
    -- Managed member - get info from team_members table
    SELECT tm.afsc, tm.rank INTO v_afsc, v_rank
    FROM team_members tm
    WHERE tm.id = v_shell.team_member_id;
    
    v_user_id := v_shell.user_id; -- Supervisor's ID (owner of the statements)
    v_team_member_id := v_shell.team_member_id;
  ELSE
    -- Real user - get info from profiles table
    SELECT p.afsc, p.rank INTO v_afsc, v_rank
    FROM profiles p
    WHERE p.id = v_shell.user_id;
    
    v_user_id := v_shell.user_id;
    v_team_member_id := NULL;
  END IF;

  -- Copy each non-empty section statement to refined_statements
  FOR v_section IN 
    SELECT * FROM epb_shell_sections 
    WHERE shell_id = p_shell_id
    AND statement_text IS NOT NULL 
    AND trim(statement_text) != ''
    AND length(trim(statement_text)) > 10 -- Only save meaningful statements
  LOOP
    INSERT INTO refined_statements (
      user_id,
      created_by,
      team_member_id,
      mpa,
      afsc,
      rank,
      statement,
      cycle_year,
      statement_type,
      source_epb_shell_id,
      is_favorite,
      applicable_mpas
    ) VALUES (
      v_user_id,
      auth.uid(),
      v_team_member_id,
      v_section.mpa,
      COALESCE(v_afsc, 'UNKNOWN'),
      COALESCE(v_rank, 'Amn')::user_rank,
      v_section.statement_text,
      v_shell.cycle_year,
      'epb',
      p_shell_id,
      FALSE,
      ARRAY[v_section.mpa]
    );
    
    v_statements_saved := v_statements_saved + 1;
  END LOOP;

  -- Update the shell status to archived
  UPDATE epb_shells
  SET 
    status = 'archived',
    archived_at = now(),
    archive_name = COALESCE(p_archive_name, 'EPB ' || v_shell.cycle_year)
  WHERE id = p_shell_id;

  -- Optionally clear the sections after archiving (for fresh start)
  IF p_clear_after_archive THEN
    UPDATE epb_shell_sections
    SET 
      statement_text = '',
      is_complete = FALSE,
      updated_at = now()
    WHERE shell_id = p_shell_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_statements_saved, p_shell_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UNARCHIVE/REACTIVATE EPB FUNCTION
-- ============================================
-- Allows reactivating an archived EPB (doesn't remove saved statements)
CREATE OR REPLACE FUNCTION unarchive_epb_shell(p_shell_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_shell RECORD;
BEGIN
  -- Get the shell and validate ownership/access
  SELECT * INTO v_shell
  FROM epb_shells
  WHERE id = p_shell_id
  AND status = 'archived'
  AND (
    (user_id = auth.uid() AND team_member_id IS NULL)
    OR
    (team_member_id IS NULL AND EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id
      AND th.supervisor_id = auth.uid()
    ))
    OR
    (team_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    ))
  );

  IF v_shell IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE epb_shells
  SET 
    status = 'active',
    archived_at = NULL
  WHERE id = p_shell_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEW: ARCHIVED EPBs WITH STATEMENT COUNTS
-- ============================================
-- Provides a list of archived EPBs with their saved statement counts
CREATE OR REPLACE VIEW archived_epbs_view AS
SELECT 
  es.id,
  es.user_id,
  es.team_member_id,
  es.cycle_year,
  es.archive_name,
  es.archived_at,
  es.created_at,
  -- Get ratee info
  CASE 
    WHEN es.team_member_id IS NOT NULL THEN tm.full_name
    ELSE p.full_name
  END AS ratee_name,
  CASE 
    WHEN es.team_member_id IS NOT NULL THEN tm.rank
    ELSE p.rank
  END AS ratee_rank,
  -- Count of statements saved from this EPB
  (
    SELECT COUNT(*) 
    FROM refined_statements rs 
    WHERE rs.source_epb_shell_id = es.id
  ) AS statement_count
FROM epb_shells es
LEFT JOIN profiles p ON p.id = es.user_id AND es.team_member_id IS NULL
LEFT JOIN team_members tm ON tm.id = es.team_member_id
WHERE es.status = 'archived';

-- ============================================
-- BULK SHARE EPB STATEMENTS FUNCTION
-- ============================================
-- Share all statements from an archived EPB at once
CREATE OR REPLACE FUNCTION bulk_share_epb_statements(
  p_shell_id UUID,
  p_share_type TEXT,
  p_shared_with_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_statement RECORD;
BEGIN
  -- Validate share_type
  IF p_share_type NOT IN ('user', 'team', 'community') THEN
    RAISE EXCEPTION 'Invalid share_type: %', p_share_type;
  END IF;

  -- For 'user' shares, shared_with_id is required
  IF p_share_type = 'user' AND p_shared_with_id IS NULL THEN
    RAISE EXCEPTION 'shared_with_id is required for user shares';
  END IF;

  -- Share each statement from this EPB
  FOR v_statement IN 
    SELECT rs.id, rs.user_id
    FROM refined_statements rs
    WHERE rs.source_epb_shell_id = p_shell_id
    AND rs.user_id = auth.uid()
  LOOP
    -- Insert share if it doesn't already exist
    INSERT INTO statement_shares (statement_id, owner_id, share_type, shared_with_id)
    VALUES (v_statement.id, v_statement.user_id, p_share_type, p_shared_with_id)
    ON CONFLICT (statement_id, share_type, shared_with_id) DO NOTHING;
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE SHARED_STATEMENTS_VIEW TO INCLUDE SOURCE EPB
-- ============================================
DROP VIEW IF EXISTS shared_statements_view;

CREATE OR REPLACE VIEW shared_statements_view 
WITH (security_invoker = true)
AS
SELECT 
  rs.id,
  rs.user_id AS owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.is_favorite,
  rs.cycle_year,
  rs.statement_type,
  rs.applicable_mpas,
  rs.award_category,
  rs.is_winning_package,
  rs.win_level,
  rs.use_as_llm_example,
  rs.source_epb_shell_id,
  rs.created_at,
  rs.updated_at,
  ss.share_type,
  ss.shared_with_id,
  ss.id AS share_id,
  p.full_name AS owner_name,
  p.rank AS owner_rank
FROM refined_statements rs
JOIN statement_shares ss ON ss.statement_id = rs.id
JOIN profiles p ON p.id = rs.user_id;

