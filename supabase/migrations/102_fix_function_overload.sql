-- Migration: Fix function overload issue
-- Problem: Migration 101 added max_depth parameter to get_visible_managed_members
-- but didn't drop the old version. This created two overloaded functions that
-- PostgREST cannot resolve when called with just viewer_uuid.
--
-- Solution: Drop dependent policies, drop old function, recreate policies using new function

-- ============================================
-- 1. DROP DEPENDENT POLICIES
-- ============================================

-- accomplishments policies
DROP POLICY IF EXISTS "Chain can view managed member accomplishments" ON accomplishments;
DROP POLICY IF EXISTS "Chain can insert managed member accomplishments" ON accomplishments;
DROP POLICY IF EXISTS "Chain can update managed member accomplishments" ON accomplishments;
DROP POLICY IF EXISTS "Chain can delete managed member accomplishments" ON accomplishments;

-- refined_statements policies
DROP POLICY IF EXISTS "Chain can view managed member refined statements" ON refined_statements;
DROP POLICY IF EXISTS "Chain can insert managed member refined statements" ON refined_statements;
DROP POLICY IF EXISTS "Chain can update managed member refined statements" ON refined_statements;

-- epb_shells policies
DROP POLICY IF EXISTS "Supervisors can create shells for managed members in chain" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can view managed member shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can update managed shells in chain" ON epb_shells;

-- epb_shell_sections policies
DROP POLICY IF EXISTS "Users can insert sections for accessible shells" ON epb_shell_sections;
DROP POLICY IF EXISTS "Users can update sections of accessible shells" ON epb_shell_sections;
DROP POLICY IF EXISTS "Users can delete sections of accessible shells" ON epb_shell_sections;

-- accomplishment_projects policies
DROP POLICY IF EXISTS "Users can view accomplishment project links" ON accomplishment_projects;
DROP POLICY IF EXISTS "Users can link own accomplishments to projects" ON accomplishment_projects;

-- ============================================
-- 2. DROP OLD FUNCTION SIGNATURES
-- ============================================

DROP FUNCTION IF EXISTS public.get_visible_managed_members(uuid);
DROP FUNCTION IF EXISTS public.get_all_managed_members(uuid);

-- ============================================
-- 3. RECREATE POLICIES USING NEW FUNCTION
-- The new function has signature: get_visible_managed_members(uuid, integer DEFAULT 20)
-- When called with just uuid, it will use the default max_depth of 20
-- ============================================

-- accomplishments policies
CREATE POLICY "Chain can view managed member accomplishments"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Chain can insert managed member accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) OR 
    created_by = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Chain can update managed member accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Chain can delete managed member accomplishments"
  ON accomplishments FOR DELETE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

-- refined_statements policies
CREATE POLICY "Chain can view managed member refined statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Chain can insert managed member refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Chain can update managed member refined statements"
  ON refined_statements FOR UPDATE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

-- epb_shells policies
CREATE POLICY "Supervisors can create shells for managed members in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Supervisors can view managed member shells"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

CREATE POLICY "Supervisors can update managed shells in chain"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  )
  WITH CHECK (
    team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

-- epb_shell_sections policies
CREATE POLICY "Users can insert sections for accessible shells"
  ON epb_shell_sections FOR INSERT
  WITH CHECK (
    shell_id IN (
      SELECT es.id FROM epb_shells es
      WHERE es.status != 'archived'
      AND (
        -- Own shell
        es.user_id = (select auth.uid())
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

CREATE POLICY "Users can update sections of accessible shells"
  ON epb_shell_sections FOR UPDATE
  USING (
    shell_id IN (
      SELECT es.id FROM epb_shells es
      WHERE es.status != 'archived'
      AND (
        -- Own shell
        es.user_id = (select auth.uid())
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

CREATE POLICY "Users can delete sections of accessible shells"
  ON epb_shell_sections FOR DELETE
  USING (
    shell_id IN (
      SELECT es.id FROM epb_shells es
      WHERE es.status != 'archived'
      AND (
        -- Own shell
        es.user_id = (select auth.uid())
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

-- accomplishment_projects policies
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

CREATE POLICY "Users can link own accomplishments to projects"
  ON accomplishment_projects FOR INSERT
  WITH CHECK (
    -- Own accomplishment
    (
      accomplishment_id IN (
        SELECT id FROM accomplishments WHERE user_id = (SELECT auth.uid())
      )
      OR accomplishment_id IN (
        SELECT id FROM accomplishments 
        WHERE created_by = (SELECT auth.uid())
        AND team_member_id IN (SELECT id FROM get_visible_managed_members((SELECT auth.uid())))
      )
    )
  );
