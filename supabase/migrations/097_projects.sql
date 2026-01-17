-- Migration: Projects System
-- Allows users to create projects, assign team members from their chain of command,
-- share project metadata (results, impact, stakeholders), and leverage this context
-- when generating EPB statements.

-- ============================================
-- MAIN PROJECTS TABLE
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT,
  -- Owner-editable metadata
  result TEXT,
  impact TEXT,
  key_stakeholders JSONB DEFAULT '[]'::jsonb, -- Array of {name, title, role}
  metrics JSONB DEFAULT '{}'::jsonb, -- {people_impacted, custom fields}
  -- Context
  cycle_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- Original creator
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_cycle_year ON projects(cycle_year);

-- ============================================
-- PROJECT MEMBERS (users or managed members)
-- ============================================
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Either a registered user or a managed member (not both)
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  -- Permissions
  is_owner BOOLEAN NOT NULL DEFAULT false, -- Multiple owners allowed
  -- Tracking
  added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Validation: Must have either profile_id or team_member_id
  CONSTRAINT valid_member CHECK (
    (profile_id IS NOT NULL AND team_member_id IS NULL) OR
    (profile_id IS NULL AND team_member_id IS NOT NULL)
  )
);

-- Unique constraints to prevent duplicate members
CREATE UNIQUE INDEX idx_project_members_profile ON project_members(project_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX idx_project_members_team_member ON project_members(project_id, team_member_id) WHERE team_member_id IS NOT NULL;
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_profile_id ON project_members(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_project_members_team_member_id ON project_members(team_member_id) WHERE team_member_id IS NOT NULL;

-- ============================================
-- ACCOMPLISHMENT PROJECTS (junction table)
-- Links accomplishments to projects
-- ============================================
CREATE TABLE accomplishment_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accomplishment_id UUID NOT NULL REFERENCES accomplishments(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Each accomplishment can only be linked to a project once
  CONSTRAINT unique_accomplishment_project UNIQUE (accomplishment_id, project_id)
);

CREATE INDEX idx_accomplishment_projects_accomplishment ON accomplishment_projects(accomplishment_id);
CREATE INDEX idx_accomplishment_projects_project ON accomplishment_projects(project_id);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accomplishment_projects ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if a user is a member of a project
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
    AND (
      -- Direct profile member
      pm.profile_id = p_user_id
      OR
      -- Linked managed member
      pm.team_member_id IN (
        SELECT id FROM public.team_members WHERE linked_user_id = p_user_id
      )
    )
  );
END;
$$;

-- Check if a user is an owner of a project
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
    AND pm.is_owner = true
    AND (
      pm.profile_id = p_user_id
      OR pm.team_member_id IN (
        SELECT id FROM public.team_members WHERE linked_user_id = p_user_id
      )
    )
  );
END;
$$;

-- Count owners of a project
CREATE OR REPLACE FUNCTION count_project_owners(p_project_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO owner_count
  FROM public.project_members
  WHERE project_id = p_project_id AND is_owner = true;
  RETURN owner_count;
END;
$$;

-- Get user's projects (where they are a member)
CREATE OR REPLACE FUNCTION get_user_projects(p_user_id UUID)
RETURNS SETOF projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.projects p
  WHERE EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p.id
    AND (
      pm.profile_id = p_user_id
      OR pm.team_member_id IN (
        SELECT id FROM public.team_members WHERE linked_user_id = p_user_id
      )
    )
  )
  ORDER BY p.updated_at DESC;
END;
$$;

-- Check if user can add a member to project (they must be a project member AND the target must be in their chain)
CREATE OR REPLACE FUNCTION can_add_project_member(p_project_id UUID, p_user_id UUID, p_target_profile_id UUID, p_target_team_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_supervisor_id UUID;
BEGIN
  -- User must be a project member
  IF NOT public.is_project_member(p_project_id, p_user_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if target is in user's chain of command
  IF p_target_profile_id IS NOT NULL THEN
    -- Target is the user themselves
    IF p_target_profile_id = p_user_id THEN
      RETURN TRUE;
    END IF;
    -- Target is a direct subordinate
    IF EXISTS (SELECT 1 FROM public.teams WHERE supervisor_id = p_user_id AND subordinate_id = p_target_profile_id) THEN
      RETURN TRUE;
    END IF;
    -- Target is in subordinate chain
    IF EXISTS (SELECT 1 FROM public.get_subordinate_chain(p_user_id) WHERE subordinate_id = p_target_profile_id) THEN
      RETURN TRUE;
    END IF;
    -- Target is user's supervisor or in supervisor chain
    IF EXISTS (SELECT 1 FROM public.teams WHERE supervisor_id = p_target_profile_id AND subordinate_id = p_user_id) THEN
      RETURN TRUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.get_supervisor_chain(p_user_id) WHERE supervisor_id = p_target_profile_id) THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  IF p_target_team_member_id IS NOT NULL THEN
    -- Get the supervisor of the managed member
    SELECT supervisor_id INTO target_supervisor_id
    FROM public.team_members WHERE id = p_target_team_member_id;
    
    -- User owns this managed member
    IF target_supervisor_id = p_user_id THEN
      RETURN TRUE;
    END IF;
    -- Managed member is owned by someone in user's subordinate chain
    IF EXISTS (SELECT 1 FROM public.get_subordinate_chain(p_user_id) WHERE subordinate_id = target_supervisor_id) THEN
      RETURN TRUE;
    END IF;
    -- User can see this managed member through visibility function
    IF EXISTS (SELECT 1 FROM public.get_visible_managed_members(p_user_id) WHERE id = p_target_team_member_id) THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Get project members with visibility info for accomplishments
CREATE OR REPLACE FUNCTION get_project_members_with_visibility(p_project_id UUID, p_viewer_id UUID)
RETURNS TABLE (
  member_id UUID,
  profile_id UUID,
  team_member_id UUID,
  is_owner BOOLEAN,
  full_name TEXT,
  rank TEXT,
  afsc TEXT,
  can_view_accomplishments BOOLEAN -- True if viewer can see this member's accomplishments
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pm.id AS member_id,
    pm.profile_id,
    pm.team_member_id,
    pm.is_owner,
    COALESCE(p.full_name, tm.full_name) AS full_name,
    COALESCE(p.rank::TEXT, tm.rank::TEXT) AS rank,
    COALESCE(p.afsc, tm.afsc) AS afsc,
    -- Can view accomplishments if:
    -- 1. It's the viewer's own profile
    -- 2. The member is in viewer's subordinate chain
    -- 3. The managed member is visible to viewer
    CASE
      WHEN pm.profile_id = p_viewer_id THEN TRUE
      WHEN pm.profile_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_subordinate_chain(p_viewer_id) sc WHERE sc.subordinate_id = pm.profile_id
      ) THEN TRUE
      WHEN pm.team_member_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_visible_managed_members(p_viewer_id) vmm WHERE vmm.id = pm.team_member_id
      ) THEN TRUE
      ELSE FALSE
    END AS can_view_accomplishments
  FROM public.project_members pm
  LEFT JOIN public.profiles p ON p.id = pm.profile_id
  LEFT JOIN public.team_members tm ON tm.id = pm.team_member_id
  WHERE pm.project_id = p_project_id;
END;
$$;

-- ============================================
-- RLS POLICIES - PROJECTS
-- ============================================

-- Users can view projects they are members of
CREATE POLICY "Members can view their projects"
  ON projects FOR SELECT
  USING (
    is_project_member(id, (SELECT auth.uid()))
  );

-- Users can create projects (they become the owner automatically)
CREATE POLICY "Users can create projects"
  ON projects FOR INSERT
  WITH CHECK (created_by = (SELECT auth.uid()));

-- Only owners can update project metadata
CREATE POLICY "Owners can update projects"
  ON projects FOR UPDATE
  USING (is_project_owner(id, (SELECT auth.uid())))
  WITH CHECK (is_project_owner(id, (SELECT auth.uid())));

-- Only owners can delete projects
CREATE POLICY "Owners can delete projects"
  ON projects FOR DELETE
  USING (is_project_owner(id, (SELECT auth.uid())));

-- ============================================
-- RLS POLICIES - PROJECT MEMBERS
-- ============================================

-- Members can view all members of their projects
CREATE POLICY "Members can view project members"
  ON project_members FOR SELECT
  USING (
    is_project_member(project_id, (SELECT auth.uid()))
  );

-- Any project member can add new members (if target is in their chain)
CREATE POLICY "Members can add members from their chain"
  ON project_members FOR INSERT
  WITH CHECK (
    added_by = (SELECT auth.uid())
    AND can_add_project_member(project_id, (SELECT auth.uid()), profile_id, team_member_id)
  );

-- Only owners can remove members (but cannot remove the last owner)
CREATE POLICY "Owners can remove members"
  ON project_members FOR DELETE
  USING (
    is_project_owner(project_id, (SELECT auth.uid()))
    -- Prevent removing the last owner
    AND NOT (
      is_owner = true 
      AND count_project_owners(project_id) <= 1
    )
  );

-- Only owners can update member roles (ownership)
CREATE POLICY "Owners can update member ownership"
  ON project_members FOR UPDATE
  USING (is_project_owner(project_id, (SELECT auth.uid())))
  WITH CHECK (
    is_project_owner(project_id, (SELECT auth.uid()))
    -- Prevent removing the last owner
    AND NOT (
      is_owner = false 
      AND (SELECT pm.is_owner FROM project_members pm WHERE pm.id = project_members.id) = true
      AND count_project_owners(project_id) <= 1
    )
  );

-- ============================================
-- RLS POLICIES - ACCOMPLISHMENT PROJECTS
-- ============================================

-- Users can see accomplishment-project links for their own accomplishments
-- or accomplishments they can view (subordinates)
CREATE POLICY "Users can view accomplishment project links"
  ON accomplishment_projects FOR SELECT
  USING (
    -- Own accomplishment
    accomplishment_id IN (
      SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid())
    )
    -- Subordinate's accomplishment
    OR accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id IN (SELECT subordinate_id FROM get_subordinate_chain((SELECT auth.uid())))
    )
    -- Managed member's accomplishment
    OR accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE team_member_id IN (SELECT id FROM get_visible_managed_members((SELECT auth.uid())))
    )
  );

-- Users can link their own accomplishments to projects they're members of
CREATE POLICY "Users can link own accomplishments to projects"
  ON accomplishment_projects FOR INSERT
  WITH CHECK (
    is_project_member(project_id, (SELECT auth.uid()))
    AND (
      -- Own accomplishment
      accomplishment_id IN (
        SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid()) AND team_member_id IS NULL
      )
      -- Subordinate's accomplishment that user created
      OR accomplishment_id IN (
        SELECT id FROM accomplishments 
        WHERE created_by = (SELECT auth.uid())
        AND user_id IN (SELECT subordinate_id FROM get_subordinate_chain((SELECT auth.uid())))
      )
      -- Managed member's accomplishment that user created
      OR accomplishment_id IN (
        SELECT id FROM accomplishments 
        WHERE created_by = (SELECT auth.uid())
        AND team_member_id IN (SELECT id FROM get_visible_managed_members((SELECT auth.uid())))
      )
    )
  );

-- Users can unlink their own accomplishments
CREATE POLICY "Users can unlink own accomplishments"
  ON accomplishment_projects FOR DELETE
  USING (
    accomplishment_id IN (
      SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid()) AND team_member_id IS NULL
    )
    OR accomplishment_id IN (
      SELECT id FROM accomplishments WHERE created_by = (SELECT auth.uid())
    )
  );

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

-- ============================================
-- AUTO-ADD CREATOR AS OWNER
-- ============================================
CREATE OR REPLACE FUNCTION add_project_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, profile_id, is_owner, added_by)
  VALUES (NEW.id, NEW.created_by, true, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_add_project_creator_as_owner
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION add_project_creator_as_owner();
