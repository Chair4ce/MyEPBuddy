-- Add chain of command visibility for award shells
-- Allows supervisors to see all award shells in their subordinate chain (not just direct reports)

-- ============================================
-- Add policy for viewing award shells in subordinate chain
-- ============================================

-- Supervisors can view shells of anyone in their subordinate chain (real users)
CREATE POLICY "Supervisors can view subordinate chain award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );

-- Supervisors can view managed member shells where the supervisor_id is in their chain
CREATE POLICY "Supervisors can view chain managed member award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND (
        tm.supervisor_id = auth.uid()
        OR tm.supervisor_id IN (
          SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
        )
      )
    )
  );

-- ============================================
-- Add update policies for chain visibility
-- ============================================

-- Supervisors can update shells of users in their subordinate chain
CREATE POLICY "Supervisors can update subordinate chain award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );

-- Supervisors can update managed member shells in their chain
CREATE POLICY "Supervisors can update chain managed member award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND (
        tm.supervisor_id = auth.uid()
        OR tm.supervisor_id IN (
          SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
        )
      )
    )
  );

-- ============================================
-- Update section policies to support chain visibility
-- ============================================

-- Add section insert policy for chain visibility
CREATE POLICY "Users can insert sections for chain award shells"
  ON award_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        -- User in subordinate chain
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
        ))
        OR
        -- Managed member where supervisor is in chain
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = auth.uid()
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
            )
          )
        ))
      )
    )
  );

-- Add section update policy for chain visibility
CREATE POLICY "Users can update sections for chain award shells"
  ON award_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = auth.uid()
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
            )
          )
        ))
      )
    )
  );

-- ============================================
-- Update snapshot policies to support chain visibility
-- ============================================

-- Add snapshot insert policy for chain visibility
CREATE POLICY "Users can insert snapshots for chain award sections"
  ON award_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shell_sections ass
      JOIN award_shells aws ON aws.id = ass.shell_id
      WHERE ass.id = award_shell_snapshots.section_id
      AND (
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = auth.uid()
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
            )
          )
        ))
      )
    )
  );

