-- Fix RLS policies for epb_shell_sections to allow supervisors to manage subordinate shells
-- Problem: Migration 102 dropped the supervisor chain checks, only allowing own shells and managed members
-- This broke the ability for supervisors to create EPBs for their enlisted subordinates

-- Drop the overly restrictive policies from migration 102
DROP POLICY IF EXISTS "Users can insert sections for accessible shells" ON epb_shell_sections;
DROP POLICY IF EXISTS "Users can update sections of accessible shells" ON epb_shell_sections;
DROP POLICY IF EXISTS "Users can delete sections of accessible shells" ON epb_shell_sections;

-- Recreate policies with full access: own shells, subordinate shells, and managed member shells
CREATE POLICY "Users can insert sections for accessible shells"
  ON epb_shell_sections FOR INSERT
  WITH CHECK (
    shell_id IN (
      SELECT es.id FROM epb_shells es
      WHERE es.status != 'archived'
      AND (
        -- Own shell (user_id matches current user, no team_member_id)
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Subordinate shell (user_id is subordinate, no team_member_id)
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member shell (team_member_id is set and in visible set)
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
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Subordinate shell
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member shell
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
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        -- Subordinate shell
        (es.team_member_id IS NULL AND es.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        -- Managed member shell
        (es.team_member_id IS NOT NULL AND es.team_member_id IN (
          SELECT id FROM get_visible_managed_members((select auth.uid()))
        ))
      )
    )
  );
