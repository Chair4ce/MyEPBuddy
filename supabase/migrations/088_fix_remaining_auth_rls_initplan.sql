-- Migration 088: Fix Remaining Auth RLS InitPlan Performance Issues
-- This migration wraps auth.uid() calls with (select auth.uid()) to prevent
-- re-evaluation for every row in RLS policies for tables added after migration 061.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

-- ============================================================================
-- AWARD SHELLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own award shells" ON award_shells;
CREATE POLICY "Users can view own award shells"
  ON award_shells FOR SELECT
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Users can view award shells they created" ON award_shells;
CREATE POLICY "Users can view award shells they created"
  ON award_shells FOR SELECT
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Supervisors can view subordinate award shells via history" ON award_shells;
CREATE POLICY "Supervisors can view subordinate award shells via history"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = award_shells.user_id
      AND th.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can view managed member award shells" ON award_shells;
CREATE POLICY "Supervisors can view managed member award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view shared award shells" ON award_shells;
CREATE POLICY "Users can view shared award shells"
  ON award_shells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM award_shell_shares ass
      WHERE ass.shell_id = award_shells.id
      AND ass.shared_with_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create own award shells" ON award_shells;
CREATE POLICY "Users can create own award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) AND 
    created_by = (select auth.uid()) AND
    team_member_id IS NULL
  );

DROP POLICY IF EXISTS "Supervisors can create subordinate award shells" ON award_shells;
CREATE POLICY "Supervisors can create subordinate award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.subordinate_id = award_shells.user_id
      AND t.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can create managed member award shells" ON award_shells;
CREATE POLICY "Supervisors can create managed member award shells"
  ON award_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own award shells" ON award_shells;
CREATE POLICY "Users can update own award shells"
  ON award_shells FOR UPDATE
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL)
  WITH CHECK (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Supervisors can update subordinate award shells via history" ON award_shells;
CREATE POLICY "Supervisors can update subordinate award shells via history"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = award_shells.user_id
      AND th.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can update managed member award shells" ON award_shells;
CREATE POLICY "Supervisors can update managed member award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND tm.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete own award shells" ON award_shells;
CREATE POLICY "Users can delete own award shells"
  ON award_shells FOR DELETE
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Supervisors can view subordinate chain award shells" ON award_shells;
CREATE POLICY "Supervisors can view subordinate chain award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can view chain managed member award shells" ON award_shells;
CREATE POLICY "Supervisors can view chain managed member award shells"
  ON award_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND (
        tm.supervisor_id = (select auth.uid())
        OR tm.supervisor_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "Supervisors can update subordinate chain award shells" ON award_shells;
CREATE POLICY "Supervisors can update subordinate chain award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can update chain managed member award shells" ON award_shells;
CREATE POLICY "Supervisors can update chain managed member award shells"
  ON award_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = award_shells.team_member_id
      AND (
        tm.supervisor_id = (select auth.uid())
        OR tm.supervisor_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        )
      )
    )
  );

-- ============================================================================
-- AWARD SHELL SECTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert sections for accessible award shells" ON award_shell_sections;
CREATE POLICY "Users can insert sections for accessible award shells"
  ON award_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.user_id = (select auth.uid()) AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can update sections of accessible award shells" ON award_shell_sections;
CREATE POLICY "Users can update sections of accessible award shells"
  ON award_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.user_id = (select auth.uid()) AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete sections of accessible award shells" ON award_shell_sections;
CREATE POLICY "Users can delete sections of accessible award shells"
  ON award_shell_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.user_id = (select auth.uid()) AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert sections for chain award shells" ON award_shell_sections;
CREATE POLICY "Users can insert sections for chain award shells"
  ON award_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = (select auth.uid())
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
            )
          )
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can update sections for chain award shells" ON award_shell_sections;
CREATE POLICY "Users can update sections for chain award shells"
  ON award_shell_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_sections.shell_id
      AND (
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = (select auth.uid())
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
            )
          )
        ))
      )
    )
  );

-- ============================================================================
-- AWARD SHELL SNAPSHOTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert snapshots for accessible award sections" ON award_shell_snapshots;
CREATE POLICY "Users can insert snapshots for accessible award sections"
  ON award_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shell_sections ass
      JOIN award_shells aws ON aws.id = ass.shell_id
      WHERE ass.id = award_shell_snapshots.section_id
      AND (
        (aws.user_id = (select auth.uid()) AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete award snapshots they created" ON award_shell_snapshots;
CREATE POLICY "Users can delete award snapshots they created"
  ON award_shell_snapshots FOR DELETE
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert snapshots for chain award sections" ON award_shell_snapshots;
CREATE POLICY "Users can insert snapshots for chain award sections"
  ON award_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM award_shell_sections ass
      JOIN award_shells aws ON aws.id = ass.shell_id
      WHERE ass.id = award_shell_snapshots.section_id
      AND (
        (aws.team_member_id IS NULL AND aws.user_id IN (
          SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND (
            tm.supervisor_id = (select auth.uid())
            OR tm.supervisor_id IN (
              SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
            )
          )
        ))
      )
    )
  );

-- ============================================================================
-- AWARD SHELL SHARES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own award shell shares" ON award_shell_shares;
CREATE POLICY "Users can view own award shell shares"
  ON award_shell_shares FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view award shells shared with them" ON award_shell_shares;
CREATE POLICY "Users can view award shells shared with them"
  ON award_shell_shares FOR SELECT
  USING (shared_with_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create award shell shares" ON award_shell_shares;
CREATE POLICY "Users can create award shell shares"
  ON award_shell_shares FOR INSERT
  WITH CHECK (
    owner_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM award_shells aws
      WHERE aws.id = award_shell_shares.shell_id
      AND (
        (aws.user_id = (select auth.uid()) AND aws.team_member_id IS NULL)
        OR
        (aws.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = aws.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (aws.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = aws.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own award shell shares" ON award_shell_shares;
CREATE POLICY "Users can delete own award shell shares"
  ON award_shell_shares FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================================
-- EPB DUTY DESCRIPTION SNAPSHOTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert duty description snapshots for accessible shells" ON epb_duty_description_snapshots;
CREATE POLICY "Users can insert duty description snapshots for accessible shel"
  ON epb_duty_description_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_duty_description_snapshots.shell_id
      AND (
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete duty description snapshots they created" ON epb_duty_description_snapshots;
CREATE POLICY "Users can delete duty description snapshots they created"
  ON epb_duty_description_snapshots FOR DELETE
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- EPB DUTY DESCRIPTION EXAMPLES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert duty description examples for accessible shells" ON epb_duty_description_examples;
CREATE POLICY "Users can insert duty description examples for accessible shell"
  ON epb_duty_description_examples FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_duty_description_examples.shell_id
      AND (
        (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL)
        OR
        (es.team_member_id IS NULL AND EXISTS (
          SELECT 1 FROM team_history th
          WHERE th.subordinate_id = es.user_id
          AND th.supervisor_id = (select auth.uid())
        ))
        OR
        (es.team_member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.id = es.team_member_id
          AND tm.supervisor_id = (select auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete duty description examples they created" ON epb_duty_description_examples;
CREATE POLICY "Users can delete duty description examples they created"
  ON epb_duty_description_examples FOR DELETE
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- USER STYLE PROFILES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own style profile" ON user_style_profiles;
CREATE POLICY "Users can view own style profile"
  ON user_style_profiles FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own style profile" ON user_style_profiles;
CREATE POLICY "Users can update own style profile"
  ON user_style_profiles FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "System can insert style profiles" ON user_style_profiles;
CREATE POLICY "System can insert style profiles"
  ON user_style_profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- USER STYLE EXAMPLES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own style examples" ON user_style_examples;
CREATE POLICY "Users can view own style examples"
  ON user_style_examples FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own style examples" ON user_style_examples;
CREATE POLICY "Users can manage own style examples"
  ON user_style_examples FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- STYLE FEEDBACK EVENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own feedback events" ON style_feedback_events;
CREATE POLICY "Users can insert own feedback events"
  ON style_feedback_events FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own feedback events" ON style_feedback_events;
CREATE POLICY "Users can view own feedback events"
  ON style_feedback_events FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- EPB SHELL FIELD LOCKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "View shell field locks" ON epb_shell_field_locks;
CREATE POLICY "View shell field locks"
  ON epb_shell_field_locks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = shell_id
      AND (
        es.user_id = (select auth.uid())
        OR es.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM epb_shell_shares ess
          WHERE ess.shell_id = es.id AND ess.shared_with_id = (select auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Manage own shell field locks" ON epb_shell_field_locks;
CREATE POLICY "Manage own shell field locks"
  ON epb_shell_field_locks FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- ACCOMPLISHMENT COMMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "View comments in chain" ON accomplishment_comments;
CREATE POLICY "View comments in chain"
  ON accomplishment_comments FOR SELECT
  USING (
    author_id = (select auth.uid())
    OR
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = (select auth.uid()) OR created_by = (select auth.uid())
    )
    OR
    is_in_accomplishment_chain(accomplishment_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "Insert comments in chain" ON accomplishment_comments;
CREATE POLICY "Insert comments in chain"
  ON accomplishment_comments FOR INSERT
  WITH CHECK (
    author_id = (select auth.uid())
    AND
    is_in_accomplishment_chain(accomplishment_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "Update own comments" ON accomplishment_comments;
CREATE POLICY "Update own comments"
  ON accomplishment_comments FOR UPDATE
  USING (author_id = (select auth.uid()))
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS "Owner can resolve comments" ON accomplishment_comments;
CREATE POLICY "Owner can resolve comments"
  ON accomplishment_comments FOR UPDATE
  USING (
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = (select auth.uid()) OR created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    accomplishment_id IN (
      SELECT id FROM accomplishments 
      WHERE user_id = (select auth.uid()) OR created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Delete own comments" ON accomplishment_comments;
CREATE POLICY "Delete own comments"
  ON accomplishment_comments FOR DELETE
  USING (author_id = (select auth.uid()));
