-- Harden accomplishment_awards INSERT: award must belong to the accomplishment ratee

DROP POLICY IF EXISTS "Users can link awards to visible accomplishments" ON accomplishment_awards;

CREATE POLICY "Users can link awards to visible accomplishments"
  ON accomplishment_awards FOR INSERT
  WITH CHECK (
    -- Accomplishment is writable by caller
    (
      accomplishment_id IN (
        SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid()) AND team_member_id IS NULL
      )
      OR accomplishment_id IN (
        SELECT id FROM accomplishments
        WHERE created_by = (SELECT auth.uid())
          AND user_id IN (SELECT subordinate_id FROM get_subordinate_chain((SELECT auth.uid())))
      )
      OR accomplishment_id IN (
        SELECT id FROM accomplishments
        WHERE created_by = (SELECT auth.uid())
          AND team_member_id IN (SELECT id FROM get_visible_managed_members((SELECT auth.uid())))
      )
    )
    -- Award recipient must match accomplishment ratee
    AND EXISTS (
      SELECT 1
      FROM accomplishments a
      JOIN awards w ON w.id = award_id
      WHERE a.id = accomplishment_id
        AND (
          (a.team_member_id IS NOT NULL AND w.recipient_team_member_id = a.team_member_id)
          OR (
            a.team_member_id IS NULL
            AND w.recipient_profile_id = a.user_id
          )
        )
    )
  );
