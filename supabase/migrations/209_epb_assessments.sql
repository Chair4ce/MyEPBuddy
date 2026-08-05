-- Permanent history of AI EPB assessments, attached to each EPB shell.
-- Every /api/assess-epb run is recorded so members can revisit past reports
-- as their statements/accomplishments evolve.

CREATE TABLE IF NOT EXISTS epb_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES epb_shells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- ratee (shell owner)
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- who ran it
  rank TEXT,
  afsc TEXT,
  model TEXT,
  cycle_year INTEGER,
  overall_strength TEXT, -- proficiency level for list display
  form_used TEXT,        -- "AF Form 931" / "AF Form 932"
  assessment JSONB NOT NULL, -- full EPBAssessmentResult
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast newest-first lookup per shell
CREATE INDEX IF NOT EXISTS idx_epb_assessments_shell_created
  ON epb_assessments(shell_id, created_at DESC);

-- RLS: access mirrors EPB shell access (owner, creator, or shared user)
ALTER TABLE epb_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assessments for accessible shells"
  ON epb_assessments FOR SELECT
  USING (
    shell_id IN (
      SELECT id FROM epb_shells
      WHERE user_id = auth.uid() OR created_by = auth.uid()
      UNION
      SELECT shell_id FROM epb_shell_shares
      WHERE shared_with_id = auth.uid()
    )
  );

CREATE POLICY "Users can create assessments for accessible shells"
  ON epb_assessments FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND shell_id IN (
      SELECT id FROM epb_shells
      WHERE user_id = auth.uid() OR created_by = auth.uid()
      UNION
      SELECT shell_id FROM epb_shell_shares
      WHERE shared_with_id = auth.uid()
    )
  );

-- Permanent record: no UPDATE/DELETE policies (immutable to app users).

COMMENT ON TABLE epb_assessments IS 'Permanent history of AI EPB (ACA) assessment reports per shell';
COMMENT ON COLUMN epb_assessments.assessment IS 'Full EPBAssessmentResult JSON (overall + category breakdown + recommendations)';
