-- Fix EPB Shells INSERT RLS Policies
-- The issue is that INSERT policies may not be matching correctly
-- This migration ensures all INSERT policies are properly configured

-- Drop all existing INSERT policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can create own shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can create shells for any subordinate in chain" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can create shells for managed members in chain" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can create subordinate shells" ON epb_shells;
DROP POLICY IF EXISTS "Supervisors can create managed member shells" ON epb_shells;

-- Users can create shells for themselves
-- user_id must be their own ID, created_by must be their own ID, team_member_id must be NULL
CREATE POLICY "Users can create own shells"
  ON epb_shells FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) 
    AND created_by = (select auth.uid()) 
    AND team_member_id IS NULL
  );

-- Supervisors can create shells for subordinates (real users) in their chain
-- created_by must be the supervisor's ID, team_member_id must be NULL
-- user_id must be a subordinate in teams or team_history
CREATE POLICY "Supervisors can create shells for any subordinate in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND team_member_id IS NULL
    AND (
      -- Direct supervision via teams table
      EXISTS (
        SELECT 1 FROM teams t
        WHERE t.subordinate_id = epb_shells.user_id
        AND t.supervisor_id = (select auth.uid())
      )
      OR
      -- Any level via team_history (historical and current supervision)
      EXISTS (
        SELECT 1 FROM team_history th
        WHERE th.subordinate_id = epb_shells.user_id
        AND th.supervisor_id = (select auth.uid())
      )
    )
  );

-- Supervisors can create shells for managed members in their chain
-- created_by must be the supervisor's ID, team_member_id must be set
-- The managed member must be supervised by the current user (directly or in chain)
CREATE POLICY "Supervisors can create shells for managed members in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND team_member_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
      AND (
        -- Direct supervisor of managed member
        tm.supervisor_id = (select auth.uid())
        OR
        -- Supervisor is in the chain of the managed member's supervisor
        EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = tm.supervisor_id
          AND th.supervisor_id = (select auth.uid())
        )
      )
    )
  );




