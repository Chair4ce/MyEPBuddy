-- Enable RLS on new tables
ALTER TABLE statement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE refined_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_statements ENABLE ROW LEVEL SECURITY;

-- Statement History Policies
CREATE POLICY "Users can view own statement history"
  ON statement_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own statement history"
  ON statement_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Supervisors can view subordinate statement history"
  ON statement_history FOR SELECT
  USING (
    ratee_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- Refined Statements Policies
CREATE POLICY "Users can view own refined statements"
  ON refined_statements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own refined statements"
  ON refined_statements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own refined statements"
  ON refined_statements FOR DELETE
  USING (auth.uid() = user_id);

-- Community Statements Policies
-- Everyone can read community statements (for LLM context)
CREATE POLICY "All users can view community statements"
  ON community_statements FOR SELECT
  USING (is_approved = true);

-- Users can contribute to community pool
CREATE POLICY "Users can insert community statements"
  ON community_statements FOR INSERT
  WITH CHECK (auth.uid() = contributor_id);

-- Users can only update their own contributions
CREATE POLICY "Users can update own community statements"
  ON community_statements FOR UPDATE
  USING (auth.uid() = contributor_id)
  WITH CHECK (auth.uid() = contributor_id);

-- Admins can manage all community statements
CREATE POLICY "Admins can manage community statements"
  ON community_statements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );





