-- Saved Example Statements (Scratchpad) for EPB Shells
-- Allows users to save generated statement examples for future reference

CREATE TABLE IF NOT EXISTS epb_saved_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES epb_shells(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES epb_shell_sections(id) ON DELETE CASCADE,
  mpa TEXT NOT NULL,
  statement_text TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by_name TEXT,
  created_by_rank TEXT,
  note TEXT, -- Optional note about this example
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by section
CREATE INDEX idx_epb_saved_examples_section ON epb_saved_examples(section_id);
CREATE INDEX idx_epb_saved_examples_shell ON epb_saved_examples(shell_id);

-- RLS Policies
ALTER TABLE epb_saved_examples ENABLE ROW LEVEL SECURITY;

-- Users can view examples for shells they have access to
CREATE POLICY "Users can view examples for accessible shells"
  ON epb_saved_examples FOR SELECT
  USING (
    shell_id IN (
      SELECT id FROM epb_shells
      WHERE user_id = auth.uid()
         OR created_by = auth.uid()
    )
  );

-- Users can create examples for shells they can edit
CREATE POLICY "Users can create examples for accessible shells"
  ON epb_saved_examples FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND shell_id IN (
      SELECT id FROM epb_shells
      WHERE user_id = auth.uid()
         OR created_by = auth.uid()
    )
  );

-- Users can delete their own examples or examples on shells they own
CREATE POLICY "Users can delete examples"
  ON epb_saved_examples FOR DELETE
  USING (
    created_by = auth.uid()
    OR shell_id IN (
      SELECT id FROM epb_shells WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE epb_saved_examples IS 'Saved example statements (scratchpad) for collaborative EPB editing';
COMMENT ON COLUMN epb_saved_examples.statement_text IS 'The generated statement text saved for reference';
COMMENT ON COLUMN epb_saved_examples.note IS 'Optional note about this example (e.g., "AI generated", "Variation 2")';

