-- Allow supervisors to create/update statements for their subordinates
-- This enables the collaborative EPB workflow where supervisors can help write statements

-- ============================================
-- 1. RLS POLICIES FOR SUPERVISOR WRITE ACCESS
-- ============================================

-- Supervisors can insert statements for subordinates in their chain
-- The statement's user_id should be the subordinate's, created_by should be the supervisor's
CREATE POLICY "Supervisors can insert subordinate statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    -- user_id must be in supervisor's subordinate chain
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain(auth.uid()))
    -- created_by must be the current user (supervisor)
    AND created_by = auth.uid()
  );

-- Supervisors can update statements they created for subordinates
CREATE POLICY "Supervisors can update subordinate statements"
  ON refined_statements FOR UPDATE
  USING (
    -- Can only update statements the supervisor created
    created_by = auth.uid()
    -- For subordinates in their chain
    AND user_id IN (SELECT subordinate_id FROM get_subordinate_chain(auth.uid()))
  )
  WITH CHECK (
    created_by = auth.uid()
    AND user_id IN (SELECT subordinate_id FROM get_subordinate_chain(auth.uid()))
  );

-- Supervisors can delete statements they created for subordinates
CREATE POLICY "Supervisors can delete subordinate statements"
  ON refined_statements FOR DELETE
  USING (
    created_by = auth.uid()
    AND user_id IN (SELECT subordinate_id FROM get_subordinate_chain(auth.uid()))
  );

-- ============================================
-- 2. ENSURE created_by IS SET ON NEW STATEMENTS
-- ============================================

-- Add trigger to auto-set created_by if not provided
CREATE OR REPLACE FUNCTION set_statement_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_statement_created_by ON refined_statements;
CREATE TRIGGER trigger_set_statement_created_by
  BEFORE INSERT ON refined_statements
  FOR EACH ROW
  EXECUTE FUNCTION set_statement_created_by();

-- ============================================
-- 3. INDEX FOR EFFICIENT QUERIES
-- ============================================

-- Index for querying statements by user_id, cycle_year, and statement_type
CREATE INDEX IF NOT EXISTS idx_refined_statements_user_cycle_type 
  ON refined_statements(user_id, cycle_year, statement_type);

-- Index for querying by team_member_id if present
CREATE INDEX IF NOT EXISTS idx_refined_statements_team_member_cycle 
  ON refined_statements(team_member_id, cycle_year) 
  WHERE team_member_id IS NOT NULL;





