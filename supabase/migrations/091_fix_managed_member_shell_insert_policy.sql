-- Migration 091: Fix EPB Shell Creation Policies for Full Chain Access
-- 
-- Issue: The INSERT policy for EPB shells was too restrictive. It only allowed:
-- - Self-creation for real users
-- - Direct supervisor (supervisor_id) for managed members
-- - team_history chain for supervisors
-- 
-- But it didn't allow:
-- - parent_profile_id (who the managed member reports to) 
-- - Full chain visibility matching get_visible_managed_members()
-- 
-- Fix: Update policies so that ANYONE in the management chain who can see a
-- real user or managed member can also create/manage their EPB shell.
-- This aligns INSERT/UPDATE/DELETE with the existing SELECT visibility rules.

-- ============================================================================
-- EPB SHELLS POLICIES - Managed Members (team_member_id IS NOT NULL)
-- ============================================================================
-- Use get_visible_managed_members to align with visibility rules

DROP POLICY IF EXISTS "Supervisors can create shells for managed members in chain" ON epb_shells;

CREATE POLICY "Supervisors can create shells for managed members in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can view managed member shells" ON epb_shells;

CREATE POLICY "Supervisors can view managed member shells"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL
    AND team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can update managed shells in chain" ON epb_shells;

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

-- ============================================================================
-- EPB SHELLS POLICIES - Real Users (team_member_id IS NULL)
-- ============================================================================
-- Use get_subordinate_chain for full chain access to real user shells

DROP POLICY IF EXISTS "Supervisors can create shells for any subordinate in chain" ON epb_shells;

CREATE POLICY "Supervisors can create shells for any subordinate in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND team_member_id IS NULL
    AND user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

-- Note: Existing policies for real users (own shells, view via history, update via history) 
-- are already correct and don't need changes

-- ============================================================================
-- EPB_SHELL_SECTIONS POLICIES
-- ============================================================================
-- The trigger that auto-creates sections when a shell is created runs in user
-- context, so we need section policies to match shell visibility

DROP POLICY IF EXISTS "Users can insert sections for accessible shells" ON epb_shell_sections;

CREATE POLICY "Users can insert sections for accessible shells"
  ON epb_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        -- Own shell (real user)
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Real user subordinate in chain
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can update sections of accessible shells" ON epb_shell_sections;

CREATE POLICY "Users can update sections of accessible shells"
  ON epb_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        -- Own shell (real user)
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Real user subordinate in chain
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete sections of accessible shells" ON epb_shell_sections;

CREATE POLICY "Users can delete sections of accessible shells"
  ON epb_shell_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
      AND (
        -- Own shell (real user)
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Real user subordinate in chain
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member in visible set
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );

-- ============================================================================
-- Also add INSERT policies for chain sections (missing from earlier migrations)
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert sections for chain award shells" ON epb_shell_sections;
