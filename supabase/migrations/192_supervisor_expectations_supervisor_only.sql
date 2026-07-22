-- Supervisor expectations are private coaching notes for the supervisor.
-- Ratees see shared feedback session guides only (supervisor_feedbacks), not expectation_text.

DROP POLICY IF EXISTS "Subordinates can read expectations set for them"
  ON public.supervisor_expectations;

DROP POLICY IF EXISTS "Linked users can read expectations for their managed account"
  ON public.supervisor_expectations;

-- SECURITY DEFINER helper previously allowed ratees/linked users to read expectations.
CREATE OR REPLACE FUNCTION public.get_expectations_for_member(
  p_subordinate_id UUID DEFAULT NULL,
  p_team_member_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  supervisor_id UUID,
  subordinate_id UUID,
  team_member_id UUID,
  expectation_text TEXT,
  supervision_start_date DATE,
  supervision_end_date DATE,
  cycle_year INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  supervisor_name TEXT,
  supervisor_rank TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.supervisor_id,
    se.subordinate_id,
    se.team_member_id,
    se.expectation_text,
    se.supervision_start_date,
    se.supervision_end_date,
    se.cycle_year,
    se.created_at,
    se.updated_at,
    p.full_name AS supervisor_name,
    p.rank::TEXT AS supervisor_rank
  FROM supervisor_expectations se
  JOIN profiles p ON p.id = se.supervisor_id
  WHERE se.supervisor_id = auth.uid()
    AND (
      (p_subordinate_id IS NOT NULL AND se.subordinate_id = p_subordinate_id)
      OR
      (p_team_member_id IS NOT NULL AND se.team_member_id = p_team_member_id)
    )
  ORDER BY se.cycle_year DESC, se.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_expectations_for_member(UUID, UUID) IS
  'Returns supervisor-owned expectations for a ratee. Caller must be the supervisor (auth.uid()).';
