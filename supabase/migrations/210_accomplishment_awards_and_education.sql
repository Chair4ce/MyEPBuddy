-- Education context on accomplishments + join table for award impact links

ALTER TABLE accomplishments
  ADD COLUMN IF NOT EXISTS education_context JSONB DEFAULT NULL;

COMMENT ON COLUMN accomplishments.education_context IS
  'Optional education metadata { program, credits, unit, completed_date }. Action/details remain mission application; impact ties education to mission.';

CREATE TABLE IF NOT EXISTS accomplishment_awards (
  accomplishment_id UUID NOT NULL REFERENCES accomplishments(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (accomplishment_id, award_id)
);

CREATE INDEX IF NOT EXISTS idx_accomplishment_awards_award
  ON accomplishment_awards(award_id);

CREATE INDEX IF NOT EXISTS idx_accomplishment_awards_accomplishment
  ON accomplishment_awards(accomplishment_id);

ALTER TABLE accomplishment_awards ENABLE ROW LEVEL SECURITY;

-- View: same visibility as parent accomplishment
CREATE POLICY "Users can view accomplishment awards for visible accomplishments"
  ON accomplishment_awards FOR SELECT
  USING (
    accomplishment_id IN (
      SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid()) AND team_member_id IS NULL
    )
    OR accomplishment_id IN (
      SELECT id FROM accomplishments
      WHERE user_id IN (SELECT subordinate_id FROM get_subordinate_chain((SELECT auth.uid())))
    )
    OR accomplishment_id IN (
      SELECT id FROM accomplishments
      WHERE team_member_id IN (SELECT id FROM get_visible_managed_members((SELECT auth.uid())))
    )
    OR accomplishment_id IN (
      SELECT id FROM accomplishments WHERE created_by = (SELECT auth.uid())
    )
  );

-- Insert: own / created subordinate / created managed accomplishments
CREATE POLICY "Users can link awards to visible accomplishments"
  ON accomplishment_awards FOR INSERT
  WITH CHECK (
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
  );

-- Delete: same as insert ownership
CREATE POLICY "Users can unlink awards from their accomplishments"
  ON accomplishment_awards FOR DELETE
  USING (
    accomplishment_id IN (
      SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid()) AND team_member_id IS NULL
    )
    OR accomplishment_id IN (
      SELECT id FROM accomplishments WHERE created_by = (SELECT auth.uid())
    )
  );

-- Allow members to log awards they received (self-entry from /entries)
DROP POLICY IF EXISTS "Users can insert own received awards" ON awards;
CREATE POLICY "Users can insert own received awards"
  ON awards FOR INSERT
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND recipient_profile_id = (SELECT auth.uid())
    AND supervisor_id = (SELECT auth.uid())
  );
