-- Award Shell System
-- A shell is a container for all 1206 category statements for an award package
-- Only 1 shell per user per cycle year per award type
-- Supervisors can view/edit shells of their subordinates (including future supervisors)
-- Mirrors the EPB Shell architecture for consistency

-- ============================================
-- AWARD SHELLS TABLE
-- ============================================
CREATE TABLE award_shells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- For real users: user_id is their profile id, team_member_id is null
  -- For managed members: user_id is the supervisor's id, team_member_id is set
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  -- Who created this shell (supervisor creating for subordinate, or self)
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Performance cycle year
  cycle_year INTEGER NOT NULL,
  -- Award configuration
  award_level TEXT NOT NULL DEFAULT 'squadron' CHECK (award_level IN ('squadron', 'group', 'wing', 'majcom', 'haf')),
  award_category TEXT NOT NULL DEFAULT 'amn' CHECK (award_category IN ('amn', 'nco', 'snco', 'fgo', 'cgo')),
  sentences_per_statement INTEGER NOT NULL DEFAULT 2 CHECK (sentences_per_statement IN (2, 3)),
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only 1 shell per user/member per cycle year
  -- For real users: unique on (user_id, cycle_year) where team_member_id is null
  -- For managed members: unique on (team_member_id, cycle_year)
  CONSTRAINT unique_award_shell_per_user_cycle UNIQUE NULLS NOT DISTINCT (user_id, team_member_id, cycle_year)
);

-- ============================================
-- AWARD SHELL CATEGORY SECTIONS
-- ============================================
-- Each category section stores the current statement texts (can have multiple statements per category)
CREATE TABLE award_shell_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES award_shells(id) ON DELETE CASCADE,
  -- 1206 category key: leadership_job_performance, significant_self_improvement, base_community_involvement
  category TEXT NOT NULL,
  -- Section order within the category (0, 1, 2, etc. for multiple statements)
  slot_index INTEGER NOT NULL DEFAULT 0,
  -- Current statement text
  statement_text TEXT NOT NULL DEFAULT '',
  -- Source type: 'actions' for performance actions, 'custom' for custom context
  source_type TEXT NOT NULL DEFAULT 'actions' CHECK (source_type IN ('actions', 'custom')),
  -- Custom context (if source_type is 'custom')
  custom_context TEXT NOT NULL DEFAULT '',
  -- Selected action IDs (if source_type is 'actions') - stored as JSON array
  selected_action_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Last editor
  last_edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique slot per category per shell
  UNIQUE(shell_id, category, slot_index)
);

-- ============================================
-- AWARD SHELL SECTION SNAPSHOTS (History)
-- ============================================
-- Snapshot history for each section - allows "time capsule" viewing
CREATE TABLE award_shell_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES award_shell_sections(id) ON DELETE CASCADE,
  -- Snapshot of the statement text
  statement_text TEXT NOT NULL,
  -- Who created this snapshot
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Optional note/label for the snapshot
  note TEXT,
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- AWARD SHELL SHARES
-- ============================================
-- Sharing shells with specific users (beyond supervisor chain)
CREATE TABLE award_shell_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES award_shells(id) ON DELETE CASCADE,
  -- Owner of the share (the person sharing)
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Share type: 'user' for specific user
  share_type TEXT NOT NULL CHECK (share_type IN ('user')),
  -- The user this shell is shared with
  shared_with_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique shares per shell/user combination
  UNIQUE(shell_id, shared_with_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_award_shells_user ON award_shells(user_id);
CREATE INDEX idx_award_shells_team_member ON award_shells(team_member_id);
CREATE INDEX idx_award_shells_created_by ON award_shells(created_by);
CREATE INDEX idx_award_shells_cycle_year ON award_shells(cycle_year);
CREATE INDEX idx_award_shell_sections_shell ON award_shell_sections(shell_id);
CREATE INDEX idx_award_shell_sections_category ON award_shell_sections(category);
CREATE INDEX idx_award_shell_snapshots_section ON award_shell_snapshots(section_id);
CREATE INDEX idx_award_shell_snapshots_created_at ON award_shell_snapshots(created_at DESC);
CREATE INDEX idx_award_shell_shares_shell ON award_shell_shares(shell_id);
CREATE INDEX idx_award_shell_shares_shared_with ON award_shell_shares(shared_with_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE award_shells ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_shell_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_shell_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_shell_shares ENABLE ROW LEVEL SECURITY;

-- ============================================
-- AWARD SHELLS POLICIES
-- ============================================

-- Users can view their own shells (where user_id is them and team_member_id is null)
CREATE POLICY "Users can view own award shells"
  ON award_shells FOR SELECT
  USING (user_id = auth.uid() AND team_member_id IS NULL);

-- Users can view shells they created (for managed members)
CREATE POLICY "Users can view award shells they created"
  ON award_shells FOR SELECT
  USING (created_by = auth.uid());

-- Supervisors can view shells of their subordinates (real users via team_history)
CREATE POLICY "Supervisors can view subordinate award shells via history"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = award_shells.user_id
      AND th.supervisor_id = auth.uid()
    )
  );

-- Supervisors can view shells for managed members they supervise
CREATE POLICY "Supervisors can view managed member award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can view shells shared with them
CREATE POLICY "Users can view shared award shells"
  ON award_shells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM award_shell_shares ass
      WHERE ass.shell_id = award_shells.id
      AND ass.shared_with_id = auth.uid()
    )
  );

-- Users can create shells for themselves
CREATE POLICY "Users can create own award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND 
    created_by = auth.uid() AND
    team_member_id IS NULL
  );

-- Supervisors can create shells for subordinates (real users)
CREATE POLICY "Supervisors can create subordinate award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.subordinate_id = award_shells.user_id
      AND t.supervisor_id = auth.uid()
    )
  );

-- Supervisors can create shells for managed members
CREATE POLICY "Supervisors can create managed member award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can update their own shells
CREATE POLICY "Users can update own award shells"
  ON award_shells FOR UPDATE
  USING (user_id = auth.uid() AND team_member_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND team_member_id IS NULL);

-- Supervisors can update shells via team history
CREATE POLICY "Supervisors can update subordinate award shells via history"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = award_shells.user_id
      AND th.supervisor_id = auth.uid()
    )
  );

-- Supervisors can update managed member shells
CREATE POLICY "Supervisors can update managed member award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can delete their own shells
CREATE POLICY "Users can delete own award shells"
  ON award_shells FOR DELETE
  USING (user_id = auth.uid() AND team_member_id IS NULL);

-- ============================================
-- AWARD SHELL SECTIONS POLICIES
-- ============================================

-- View sections if user can view the parent shell
CREATE POLICY "Users can view sections of accessible award shells"
  ON award_shell_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
    )
  );

-- Insert sections if user can update the parent shell
CREATE POLICY "Users can insert sections for accessible award shells"
  ON award_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        -- Own shell
        (aws.user_id = auth.uid() AND aws.team_member_id IS NULL)
        OR
        -- Supervisor via history
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        -- Managed member
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Update sections if user can update the parent shell
CREATE POLICY "Users can update sections of accessible award shells"
  ON award_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        -- Own shell
        (aws.user_id = auth.uid() AND aws.team_member_id IS NULL)
        OR
        -- Supervisor via history
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        -- Managed member
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Delete sections if user can update the parent shell
CREATE POLICY "Users can delete sections of accessible award shells"
  ON award_shell_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.user_id = auth.uid() AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- ============================================
-- AWARD SHELL SNAPSHOTS POLICIES
-- ============================================

-- View snapshots if user can view the parent section
CREATE POLICY "Users can view snapshots of accessible award sections"
  ON award_shell_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM award_shell_sections ass
      WHERE ass.id = award_shell_snapshots.section_id
    )
  );

-- Insert snapshots if user can update the parent section
CREATE POLICY "Users can insert snapshots for accessible award sections"
  ON award_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shell_sections ass
      JOIN award_shells aws ON aws.id = ass.shell_id
      WHERE ass.id = award_shell_snapshots.section_id
      AND (
        (aws.user_id = auth.uid() AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Delete own snapshots
CREATE POLICY "Users can delete award snapshots they created"
  ON award_shell_snapshots FOR DELETE
  USING (created_by = auth.uid());

-- ============================================
-- AWARD SHELL SHARES POLICIES
-- ============================================

-- Users can view shares they own
CREATE POLICY "Users can view own award shell shares"
  ON award_shell_shares FOR SELECT
  USING (owner_id = auth.uid());

-- Users can view shares where they are the recipient
CREATE POLICY "Users can view award shells shared with them"
  ON award_shell_shares FOR SELECT
  USING (shared_with_id = auth.uid());

-- Users can create shares for shells they can access
CREATE POLICY "Users can create award shell shares"
  ON award_shell_shares FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_shares.shell_id
      AND (
        (aws.user_id = auth.uid() AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Users can delete shares they own
CREATE POLICY "Users can delete own award shell shares"
  ON award_shell_shares FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_award_shell_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER award_shells_updated_at
  BEFORE UPDATE ON award_shells
  FOR EACH ROW EXECUTE FUNCTION update_award_shell_updated_at();

CREATE TRIGGER award_shell_sections_updated_at
  BEFORE UPDATE ON award_shell_sections
  FOR EACH ROW EXECUTE FUNCTION update_award_shell_updated_at();

-- ============================================
-- TRIGGER: Auto-create category sections when shell is created
-- ============================================
CREATE OR REPLACE FUNCTION create_award_shell_sections()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert one section per 1206 category for the new shell (slot_index 0)
  INSERT INTO award_shell_sections (shell_id, category, slot_index, last_edited_by)
  VALUES 
    (NEW.id, 'leadership_job_performance', 0, NEW.created_by),
    (NEW.id, 'significant_self_improvement', 0, NEW.created_by),
    (NEW.id, 'base_community_involvement', 0, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER award_shells_create_sections
  AFTER INSERT ON award_shells
  FOR EACH ROW EXECUTE FUNCTION create_award_shell_sections();

-- ============================================
-- FUNCTION: Get shell with sections
-- ============================================
CREATE OR REPLACE FUNCTION get_award_shell_with_sections(p_shell_id UUID)
RETURNS TABLE (
  shell_id UUID,
  user_id UUID,
  team_member_id UUID,
  cycle_year INTEGER,
  award_level TEXT,
  award_category TEXT,
  sentences_per_statement INTEGER,
  created_by UUID,
  shell_created_at TIMESTAMPTZ,
  shell_updated_at TIMESTAMPTZ,
  section_id UUID,
  category TEXT,
  slot_index INTEGER,
  statement_text TEXT,
  source_type TEXT,
  custom_context TEXT,
  selected_action_ids JSONB,
  section_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aws.id AS shell_id,
    aws.user_id,
    aws.team_member_id,
    aws.cycle_year,
    aws.award_level,
    aws.award_category,
    aws.sentences_per_statement,
    aws.created_by,
    aws.created_at AS shell_created_at,
    aws.updated_at AS shell_updated_at,
    ass.id AS section_id,
    ass.category,
    ass.slot_index,
    ass.statement_text,
    ass.source_type,
    ass.custom_context,
    ass.selected_action_ids,
    ass.updated_at AS section_updated_at
  FROM award_shells aws
  LEFT JOIN award_shell_sections ass ON ass.shell_id = aws.id
  WHERE aws.id = p_shell_id
  ORDER BY 
    CASE ass.category
      WHEN 'leadership_job_performance' THEN 1
      WHEN 'significant_self_improvement' THEN 2
      WHEN 'base_community_involvement' THEN 3
      ELSE 4
    END,
    ass.slot_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

