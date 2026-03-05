-- Add missing DELETE policies for award_shells
-- Previously only the shell owner (user_id = auth.uid()) could delete.
-- Supervisors and managed-member owners need delete access too.

-- Supervisors can delete shells of their subordinates (via team_history)
CREATE POLICY "Supervisors can delete subordinate award shells via history"
  ON award_shells FOR DELETE
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = award_shells.user_id
      AND th.supervisor_id = (select auth.uid())
    )
  );

-- Supervisors can delete shells via subordinate chain
CREATE POLICY "Supervisors can delete subordinate chain award shells"
  ON award_shells FOR DELETE
  USING (
    team_member_id IS NULL AND
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

-- Supervisors can delete managed member award shells
CREATE POLICY "Supervisors can delete managed member award shells"
  ON award_shells FOR DELETE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = (select auth.uid())
    )
  );

-- Creators can delete shells they created (e.g. supervisor who created for subordinate)
CREATE POLICY "Creators can delete award shells they created"
  ON award_shells FOR DELETE
  USING (created_by = (select auth.uid()));
