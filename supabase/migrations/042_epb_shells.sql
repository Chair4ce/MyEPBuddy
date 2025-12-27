-- EPB Shell System
-- A shell is a container for all MPA statements for a performance cycle
-- Only 1 shell per user per cycle year
-- Supervisors can view/edit shells of their subordinates (including future supervisors)

-- ============================================
-- EPB SHELLS TABLE
-- ============================================
CREATE TABLE epb_shells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- For real users: user_id is their profile id, team_member_id is null
  -- For managed members: user_id is the supervisor's id, team_member_id is set
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  -- Who created this shell (supervisor creating for subordinate, or self)
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Performance cycle year
  cycle_year INTEGER NOT NULL,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only 1 shell per user/member per cycle year
  -- For real users: unique on (user_id, cycle_year) where team_member_id is null
  -- For managed members: unique on (team_member_id, cycle_year)
  CONSTRAINT unique_shell_per_user_cycle UNIQUE NULLS NOT DISTINCT (user_id, team_member_id, cycle_year)
);

-- ============================================
-- EPB SHELL MPA SECTIONS
-- ============================================
-- Each MPA section stores the current statement text
CREATE TABLE epb_shell_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES epb_shells(id) ON DELETE CASCADE,
  -- MPA key: executing_mission, leading_people, managing_resources, improving_unit, hlr_assessment
  mpa TEXT NOT NULL,
  -- Current statement text (max 350 chars, HLR max 250)
  statement_text TEXT NOT NULL DEFAULT '',
  -- Last editor
  last_edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only 1 section per MPA per shell
  UNIQUE(shell_id, mpa)
);

-- ============================================
-- EPB SHELL SECTION SNAPSHOTS (History)
-- ============================================
-- Snapshot history for each section - allows "time capsule" viewing
CREATE TABLE epb_shell_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES epb_shell_sections(id) ON DELETE CASCADE,
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
-- EPB SHELL SHARES
-- ============================================
-- Sharing shells with specific users (beyond supervisor chain)
CREATE TABLE epb_shell_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id UUID NOT NULL REFERENCES epb_shells(id) ON DELETE CASCADE,
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
CREATE INDEX idx_epb_shells_user ON epb_shells(user_id);
CREATE INDEX idx_epb_shells_team_member ON epb_shells(team_member_id);
CREATE INDEX idx_epb_shells_created_by ON epb_shells(created_by);
CREATE INDEX idx_epb_shells_cycle_year ON epb_shells(cycle_year);
CREATE INDEX idx_epb_shell_sections_shell ON epb_shell_sections(shell_id);
CREATE INDEX idx_epb_shell_sections_mpa ON epb_shell_sections(mpa);
CREATE INDEX idx_epb_shell_snapshots_section ON epb_shell_snapshots(section_id);
CREATE INDEX idx_epb_shell_snapshots_created_at ON epb_shell_snapshots(created_at DESC);
CREATE INDEX idx_epb_shell_shares_shell ON epb_shell_shares(shell_id);
CREATE INDEX idx_epb_shell_shares_shared_with ON epb_shell_shares(shared_with_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE epb_shells ENABLE ROW LEVEL SECURITY;
ALTER TABLE epb_shell_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE epb_shell_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE epb_shell_shares ENABLE ROW LEVEL SECURITY;

-- ============================================
-- EPB SHELLS POLICIES
-- ============================================

-- Users can view their own shells (where user_id is them and team_member_id is null)
CREATE POLICY "Users can view own shells"
  ON epb_shells FOR SELECT
  USING (user_id = auth.uid() AND team_member_id IS NULL);

-- Users can view shells they created (for managed members)
CREATE POLICY "Users can view shells they created"
  ON epb_shells FOR SELECT
  USING (created_by = auth.uid());

-- Supervisors can view shells of their subordinates (real users via team_history)
CREATE POLICY "Supervisors can view subordinate shells via history"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id
      AND th.supervisor_id = auth.uid()
    )
  );

-- Supervisors can view shells for managed members they supervise
CREATE POLICY "Supervisors can view managed member shells"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can view shells shared with them
CREATE POLICY "Users can view shared shells"
  ON epb_shells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM epb_shell_shares ess
      WHERE ess.shell_id = epb_shells.id
      AND ess.shared_with_id = auth.uid()
    )
  );

-- Users can create shells for themselves
CREATE POLICY "Users can create own shells"
  ON epb_shells FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND 
    created_by = auth.uid() AND
    team_member_id IS NULL
  );

-- Supervisors can create shells for subordinates (real users)
CREATE POLICY "Supervisors can create subordinate shells"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.subordinate_id = epb_shells.user_id
      AND t.supervisor_id = auth.uid()
    )
  );

-- Supervisors can create shells for managed members
CREATE POLICY "Supervisors can create managed member shells"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can update their own shells
CREATE POLICY "Users can update own shells"
  ON epb_shells FOR UPDATE
  USING (user_id = auth.uid() AND team_member_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND team_member_id IS NULL);

-- Supervisors can update shells via team history
CREATE POLICY "Supervisors can update subordinate shells via history"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id
      AND th.supervisor_id = auth.uid()
    )
  );

-- Supervisors can update managed member shells
CREATE POLICY "Supervisors can update managed member shells"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND tm.supervisor_id = auth.uid()
    )
  );

-- Users can delete their own shells
CREATE POLICY "Users can delete own shells"
  ON epb_shells FOR DELETE
  USING (user_id = auth.uid() AND team_member_id IS NULL);

-- ============================================
-- EPB SHELL SECTIONS POLICIES
-- ============================================

-- View sections if user can view the parent shell
CREATE POLICY "Users can view sections of accessible shells"
  ON epb_shell_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
    )
  );

-- Insert sections if user can update the parent shell
CREATE POLICY "Users can insert sections for accessible shells"
  ON epb_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        -- Own shell
        (es.user_id = auth.uid() AND es.team_member_id IS NULL)
        OR
        -- Supervisor via history
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        -- Managed member
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Update sections if user can update the parent shell
CREATE POLICY "Users can update sections of accessible shells"
  ON epb_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        -- Own shell
        (es.user_id = auth.uid() AND es.team_member_id IS NULL)
        OR
        -- Supervisor via history
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        -- Managed member
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Delete sections if user can update the parent shell
CREATE POLICY "Users can delete sections of accessible shells"
  ON epb_shell_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        (es.user_id = auth.uid() AND es.team_member_id IS NULL)
        OR
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- ============================================
-- EPB SHELL SNAPSHOTS POLICIES
-- ============================================

-- View snapshots if user can view the parent section
CREATE POLICY "Users can view snapshots of accessible sections"
  ON epb_shell_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM epb_shell_sections ess
      WHERE ess.id = epb_shell_snapshots.section_id
    )
  );

-- Insert snapshots if user can update the parent section
CREATE POLICY "Users can insert snapshots for accessible sections"
  ON epb_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shell_sections ess
      JOIN epb_shells es ON es.id = ess.shell_id
      WHERE ess.id = epb_shell_snapshots.section_id
      AND (
        (es.user_id = auth.uid() AND es.team_member_id IS NULL)
        OR
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Delete own snapshots
CREATE POLICY "Users can delete snapshots they created"
  ON epb_shell_snapshots FOR DELETE
  USING (created_by = auth.uid());

-- ============================================
-- EPB SHELL SHARES POLICIES
-- ============================================

-- Users can view shares they own
CREATE POLICY "Users can view own shell shares"
  ON epb_shell_shares FOR SELECT
  USING (owner_id = auth.uid());

-- Users can view shares where they are the recipient
CREATE POLICY "Users can view shells shared with them"
  ON epb_shell_shares FOR SELECT
  USING (shared_with_id = auth.uid());

-- Users can create shares for shells they can access
CREATE POLICY "Users can create shell shares"
  ON epb_shell_shares FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_shares.shell_id
      AND (
        (es.user_id = auth.uid() AND es.team_member_id IS NULL)
        OR
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = auth.uid()
        ))
        OR
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = auth.uid()
        ))
      )
    )
  );

-- Users can delete shares they own
CREATE POLICY "Users can delete own shell shares"
  ON epb_shell_shares FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_epb_shell_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER epb_shells_updated_at
  BEFORE UPDATE ON epb_shells
  FOR EACH ROW EXECUTE FUNCTION update_epb_shell_updated_at();

CREATE TRIGGER epb_shell_sections_updated_at
  BEFORE UPDATE ON epb_shell_sections
  FOR EACH ROW EXECUTE FUNCTION update_epb_shell_updated_at();

-- ============================================
-- TRIGGER: Auto-create MPA sections when shell is created
-- ============================================
CREATE OR REPLACE FUNCTION create_epb_shell_sections()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert all standard MPA sections for the new shell
  INSERT INTO epb_shell_sections (shell_id, mpa, last_edited_by)
  VALUES 
    (NEW.id, 'executing_mission', NEW.created_by),
    (NEW.id, 'leading_people', NEW.created_by),
    (NEW.id, 'managing_resources', NEW.created_by),
    (NEW.id, 'improving_unit', NEW.created_by),
    (NEW.id, 'hlr_assessment', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER epb_shells_create_sections
  AFTER INSERT ON epb_shells
  FOR EACH ROW EXECUTE FUNCTION create_epb_shell_sections();

-- ============================================
-- FUNCTION: Get shell with sections
-- ============================================
CREATE OR REPLACE FUNCTION get_epb_shell_with_sections(p_shell_id UUID)
RETURNS TABLE (
  shell_id UUID,
  user_id UUID,
  team_member_id UUID,
  cycle_year INTEGER,
  created_by UUID,
  shell_created_at TIMESTAMPTZ,
  shell_updated_at TIMESTAMPTZ,
  section_id UUID,
  mpa TEXT,
  statement_text TEXT,
  section_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    es.id AS shell_id,
    es.user_id,
    es.team_member_id,
    es.cycle_year,
    es.created_by,
    es.created_at AS shell_created_at,
    es.updated_at AS shell_updated_at,
    ess.id AS section_id,
    ess.mpa,
    ess.statement_text,
    ess.updated_at AS section_updated_at
  FROM epb_shells es
  LEFT JOIN epb_shell_sections ess ON ess.shell_id = es.id
  WHERE es.id = p_shell_id
  ORDER BY 
    CASE ess.mpa
      WHEN 'executing_mission' THEN 1
      WHEN 'leading_people' THEN 2
      WHEN 'managing_resources' THEN 3
      WHEN 'improving_unit' THEN 4
      WHEN 'hlr_assessment' THEN 5
      ELSE 6
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



