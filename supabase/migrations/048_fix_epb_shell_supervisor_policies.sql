-- Fix EPB shell policies to allow supervisors at any level to create shells
-- The current policy only allows direct supervisors, not the full chain

-- Drop the existing INSERT policies
DROP POLICY IF EXISTS "Supervisors can create subordinate shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can create managed member shells" ON epb_shells;

-- Recreate with team_history for full chain support
CREATE POLICY "Supervisors can create shells for any subordinate in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NULL AND
    (
      -- Direct supervision via teams
      EXISTS (
        SELECT 1 FROM teams t
        WHERE t.subordinate_id = epb_shells.user_id
        AND t.supervisor_id = auth.uid()
      )
      OR
      -- Any level via team_history (historical and current supervision)
      EXISTS (
        SELECT 1 FROM team_history th
        WHERE th.subordinate_id = epb_shells.user_id
        AND th.supervisor_id = auth.uid()
      )
    )
  );

-- Supervisors can create shells for managed members (via direct or chain supervision)
CREATE POLICY "Supervisors can create shells for managed members in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND (
        -- Direct supervisor of managed member
        tm.supervisor_id = auth.uid()
        OR
        -- Supervisor is in the chain of the managed member's supervisor
        EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = tm.supervisor_id
          AND th.supervisor_id = auth.uid()
        )
      )
    )
  );

-- Also fix UPDATE policies for shells
DROP POLICY IF EXISTS "Users can update own shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can update subordinate shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can update managed member shells" ON epb_shells;

-- Users can update their own shells
CREATE POLICY "Users can update own shells"
  ON epb_shells FOR UPDATE
  USING (user_id = auth.uid() AND team_member_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND team_member_id IS NULL);

-- Supervisors can update shells for anyone in their chain
CREATE POLICY "Supervisors can update shells in chain"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    (
      EXISTS (
        SELECT 1 FROM teams t
        WHERE t.subordinate_id = epb_shells.user_id
        AND t.supervisor_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM team_history th
        WHERE th.subordinate_id = epb_shells.user_id
        AND th.supervisor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    team_member_id IS NULL AND
    (
      EXISTS (
        SELECT 1 FROM teams t
        WHERE t.subordinate_id = epb_shells.user_id
        AND t.supervisor_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM team_history th
        WHERE th.subordinate_id = epb_shells.user_id
        AND th.supervisor_id = auth.uid()
      )
    )
  );

-- Supervisors can update managed member shells
CREATE POLICY "Supervisors can update managed shells in chain"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND (
        tm.supervisor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = tm.supervisor_id
          AND th.supervisor_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND (
        tm.supervisor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = tm.supervisor_id
          AND th.supervisor_id = auth.uid()
        )
      )
    )
  );

