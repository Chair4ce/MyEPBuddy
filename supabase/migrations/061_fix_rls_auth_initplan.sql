-- Migration 061: Fix Auth RLS InitPlan Performance Issues
-- This migration wraps auth.uid() calls with (select auth.uid()) to prevent
-- re-evaluation for every row in RLS policies.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ============================================================================
-- ACCOMPLISHMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own accomplishments" ON accomplishments;
CREATE POLICY "Users can view own accomplishments"
  ON accomplishments FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own accomplishments" ON accomplishments;
CREATE POLICY "Users can insert own accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (user_id = (select auth.uid()) AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own accomplishments" ON accomplishments;
CREATE POLICY "Users can update own accomplishments"
  ON accomplishments FOR UPDATE
  USING (user_id = (select auth.uid()) AND created_by = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()) AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own accomplishments" ON accomplishments;
CREATE POLICY "Users can delete own accomplishments"
  ON accomplishments FOR DELETE
  USING (user_id = (select auth.uid()) AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Supervisors can view subordinate chain accomplishments" ON accomplishments;
CREATE POLICY "Supervisors can view subordinate chain accomplishments"
  ON accomplishments FOR SELECT
  USING (
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can insert subordinate accomplishments" ON accomplishments;
CREATE POLICY "Supervisors can insert subordinate accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Supervisors can update subordinates accomplishments" ON accomplishments;
CREATE POLICY "Supervisors can update subordinates accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    created_by = (select auth.uid()) AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = (select auth.uid())
    )
  )
  WITH CHECK (
    created_by = (select auth.uid()) AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can delete subordinates accomplishments" ON accomplishments;
CREATE POLICY "Supervisors can delete subordinates accomplishments"
  ON accomplishments FOR DELETE
  USING (
    created_by = (select auth.uid()) AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Chain can view managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can view managed member accomplishments"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Chain can insert managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can insert managed member accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) OR 
    created_by = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Chain can update managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can update managed member accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Chain can delete managed member accomplishments" ON accomplishments;
CREATE POLICY "Chain can delete managed member accomplishments"
  ON accomplishments FOR DELETE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can view accomplishments for accepted pending links" ON accomplishments;
CREATE POLICY "Users can view accomplishments for accepted pending links"
  ON accomplishments FOR SELECT
  USING (
    team_member_id IN (
      SELECT team_member_id FROM pending_managed_links
      WHERE user_id = (select auth.uid()) 
        AND status = 'pending' 
        AND supervisor_accepted = true
    )
  );

-- ============================================================================
-- REFINED STATEMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own statements" ON refined_statements;
CREATE POLICY "Users can view own statements"
  ON refined_statements FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own refined statements" ON refined_statements;
CREATE POLICY "Users can insert own refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own refined statements" ON refined_statements;
CREATE POLICY "Users can update own refined statements"
  ON refined_statements FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own refined statements" ON refined_statements;
CREATE POLICY "Users can delete own refined statements"
  ON refined_statements FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Supervisors can view subordinate chain statements" ON refined_statements;
CREATE POLICY "Supervisors can view subordinate chain statements"
  ON refined_statements FOR SELECT
  USING (
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can view managed member statements" ON refined_statements;
CREATE POLICY "Supervisors can view managed member statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can insert subordinate statements" ON refined_statements;
CREATE POLICY "Supervisors can insert subordinate statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Supervisors can update subordinate statements" ON refined_statements;
CREATE POLICY "Supervisors can update subordinate statements"
  ON refined_statements FOR UPDATE
  USING (
    created_by = (select auth.uid()) AND
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
  )
  WITH CHECK (
    created_by = (select auth.uid()) AND
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
  );

DROP POLICY IF EXISTS "Supervisors can delete subordinate statements" ON refined_statements;
CREATE POLICY "Supervisors can delete subordinate statements"
  ON refined_statements FOR DELETE
  USING (
    created_by = (select auth.uid()) AND
    user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
  );

DROP POLICY IF EXISTS "Chain can view managed member refined statements" ON refined_statements;
CREATE POLICY "Chain can view managed member refined statements"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Chain can insert managed member refined statements" ON refined_statements;
CREATE POLICY "Chain can insert managed member refined statements"
  ON refined_statements FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Chain can update managed member refined statements" ON refined_statements;
CREATE POLICY "Chain can update managed member refined statements"
  ON refined_statements FOR UPDATE
  USING (
    user_id = (select auth.uid()) OR
    team_member_id IN (
      SELECT id FROM get_visible_managed_members((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can view shared statements" ON refined_statements;
CREATE POLICY "Users can view shared statements"
  ON refined_statements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM statement_shares ss
      WHERE ss.statement_id = refined_statements.id
        AND (
          (ss.share_type = 'user' AND ss.shared_with_id = (select auth.uid()))
          OR (ss.share_type = 'team' AND (
            (select auth.uid()) IN (SELECT subordinate_id FROM teams WHERE supervisor_id = ss.owner_id)
            OR (select auth.uid()) IN (SELECT supervisor_id FROM teams WHERE subordinate_id = ss.owner_id)
            OR EXISTS (
              SELECT 1 FROM teams t1 
              JOIN teams t2 ON t1.supervisor_id = t2.supervisor_id
              WHERE t1.subordinate_id = ss.owner_id AND t2.subordinate_id = (select auth.uid())
            )
          ))
          OR ss.share_type = 'community'
        )
    )
  );

DROP POLICY IF EXISTS "Users can view statements for accepted pending links" ON refined_statements;
CREATE POLICY "Users can view statements for accepted pending links"
  ON refined_statements FOR SELECT
  USING (
    team_member_id IN (
      SELECT team_member_id FROM pending_managed_links
      WHERE user_id = (select auth.uid()) 
        AND status = 'pending' 
        AND supervisor_accepted = true
    )
  );

-- ============================================================================
-- EPB CONFIG POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can update epb_config" ON epb_config;
CREATE POLICY "Admins can update epb_config"
  ON epb_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- ============================================================================
-- USER API KEYS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own api keys" ON user_api_keys;
CREATE POLICY "Users can view own api keys"
  ON user_api_keys FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own api keys" ON user_api_keys;
CREATE POLICY "Users can insert own api keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own api keys" ON user_api_keys;
CREATE POLICY "Users can update own api keys"
  ON user_api_keys FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own api keys" ON user_api_keys;
CREATE POLICY "Users can delete own api keys"
  ON user_api_keys FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- USER LLM SETTINGS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own LLM settings" ON user_llm_settings;
CREATE POLICY "Users can view own LLM settings"
  ON user_llm_settings FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own LLM settings" ON user_llm_settings;
CREATE POLICY "Users can insert own LLM settings"
  ON user_llm_settings FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own LLM settings" ON user_llm_settings;
CREATE POLICY "Users can update own LLM settings"
  ON user_llm_settings FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- STATEMENT HISTORY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own statement history" ON statement_history;
CREATE POLICY "Users can view own statement history"
  ON statement_history FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own statement history" ON statement_history;
CREATE POLICY "Users can insert own statement history"
  ON statement_history FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Supervisors can view subordinate statement history" ON statement_history;
CREATE POLICY "Supervisors can view subordinate statement history"
  ON statement_history FOR SELECT
  USING (
    ratee_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Chain supervisors can view subordinate chain statement history" ON statement_history;
CREATE POLICY "Chain supervisors can view subordinate chain statement history"
  ON statement_history FOR SELECT
  USING (
    ratee_id IN (
      SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can view managed member statement history" ON statement_history;
CREATE POLICY "Supervisors can view managed member statement history"
  ON statement_history FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can insert managed member statement history" ON statement_history;
CREATE POLICY "Supervisors can insert managed member statement history"
  ON statement_history FOR INSERT
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = (select auth.uid())
    )
    OR user_id = (select auth.uid())
  );

-- ============================================================================
-- STATEMENT SHARES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own shares" ON statement_shares;
CREATE POLICY "Users can view own shares"
  ON statement_shares FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view shares for them" ON statement_shares;
CREATE POLICY "Users can view shares for them"
  ON statement_shares FOR SELECT
  USING (share_type = 'user' AND shared_with_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view team shares" ON statement_shares;
CREATE POLICY "Users can view team shares"
  ON statement_shares FOR SELECT
  USING (
    share_type = 'team' AND (
      (select auth.uid()) IN (SELECT subordinate_id FROM teams WHERE supervisor_id = statement_shares.owner_id)
      OR (select auth.uid()) IN (SELECT supervisor_id FROM teams WHERE subordinate_id = statement_shares.owner_id)
      OR EXISTS (
        SELECT 1 FROM teams t1 
        JOIN teams t2 ON t1.supervisor_id = t2.supervisor_id
        WHERE t1.subordinate_id = statement_shares.owner_id AND t2.subordinate_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can create own shares" ON statement_shares;
CREATE POLICY "Users can create own shares"
  ON statement_shares FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own shares" ON statement_shares;
CREATE POLICY "Users can delete own shares"
  ON statement_shares FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================================
-- STATEMENT VOTES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can vote" ON statement_votes;
CREATE POLICY "Users can vote"
  ON statement_votes FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can change their vote" ON statement_votes;
CREATE POLICY "Users can change their vote"
  ON statement_votes FOR UPDATE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can remove their vote" ON statement_votes;
CREATE POLICY "Users can remove their vote"
  ON statement_votes FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- COMMUNITY STATEMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert community statements" ON community_statements;
CREATE POLICY "Users can insert community statements"
  ON community_statements FOR INSERT
  WITH CHECK ((select auth.uid()) = contributor_id);

DROP POLICY IF EXISTS "Users can update own community statements" ON community_statements;
CREATE POLICY "Users can update own community statements"
  ON community_statements FOR UPDATE
  USING ((select auth.uid()) = contributor_id)
  WITH CHECK ((select auth.uid()) = contributor_id);

DROP POLICY IF EXISTS "Admins can manage community statements" ON community_statements;
CREATE POLICY "Admins can manage community statements"
  ON community_statements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- ============================================================================
-- TEAMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view teams in their chain" ON teams;
CREATE POLICY "Users can view teams in their chain"
  ON teams FOR SELECT
  USING (
    supervisor_id = (select auth.uid()) OR
    subordinate_id = (select auth.uid()) OR
    supervisor_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
  );

DROP POLICY IF EXISTS "Users can create team relationships they're part of" ON teams;
CREATE POLICY "Users can create team relationships they're part of"
  ON teams FOR INSERT
  WITH CHECK (supervisor_id = (select auth.uid()) OR subordinate_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can remove team relationships they're part of" ON teams;
CREATE POLICY "Users can remove team relationships they're part of"
  ON teams FOR DELETE
  USING (supervisor_id = (select auth.uid()) OR subordinate_id = (select auth.uid()));

-- ============================================================================
-- TEAM REQUESTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view requests involving them" ON team_requests;
CREATE POLICY "Users can view requests involving them"
  ON team_requests FOR SELECT
  USING (requester_id = (select auth.uid()) OR target_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create requests" ON team_requests;
CREATE POLICY "Users can create requests"
  ON team_requests FOR INSERT
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Target users can update request status" ON team_requests;
CREATE POLICY "Target users can update request status"
  ON team_requests FOR UPDATE
  USING (target_id = (select auth.uid()))
  WITH CHECK (target_id = (select auth.uid()));

DROP POLICY IF EXISTS "Requesters can delete pending requests" ON team_requests;
CREATE POLICY "Requesters can delete pending requests"
  ON team_requests FOR DELETE
  USING (requester_id = (select auth.uid()) AND status = 'pending');

-- ============================================================================
-- TEAM MEMBERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Supervisors can create managed members" ON team_members;
CREATE POLICY "Supervisors can create managed members"
  ON team_members FOR INSERT
  WITH CHECK (supervisor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Supervisors can update their managed members" ON team_members;
CREATE POLICY "Supervisors can update their managed members"
  ON team_members FOR UPDATE
  USING (supervisor_id = (select auth.uid()))
  WITH CHECK (supervisor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Supervisors can delete their managed members" ON team_members;
CREATE POLICY "Supervisors can delete their managed members"
  ON team_members FOR DELETE
  USING (supervisor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can modify their created team members" ON team_members;
CREATE POLICY "Users can modify their created team members"
  ON team_members FOR ALL
  USING (supervisor_id = (select auth.uid()))
  WITH CHECK (supervisor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Linked users can view their team_member records" ON team_members;
CREATE POLICY "Linked users can view their team_member records"
  ON team_members FOR SELECT
  USING (linked_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view team members in their chain" ON team_members;
CREATE POLICY "Users can view team members in their chain"
  ON team_members FOR SELECT
  USING (can_view_team_member(supervisor_id, parent_profile_id, parent_team_member_id, linked_user_id, (select auth.uid())));

DROP POLICY IF EXISTS "Users can view team_members with pending links to them" ON team_members;
CREATE POLICY "Users can view team_members with pending links to them"
  ON team_members FOR SELECT
  USING (
    id IN (
      SELECT team_member_id FROM pending_managed_links WHERE user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TEAM HISTORY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own team history" ON team_history;
CREATE POLICY "Users can view their own team history"
  ON team_history FOR SELECT
  USING (subordinate_id = (select auth.uid()) OR supervisor_id = (select auth.uid()));

-- ============================================================================
-- PENDING MANAGED LINKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their pending links" ON pending_managed_links;
CREATE POLICY "Users can view their pending links"
  ON pending_managed_links FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their pending links" ON pending_managed_links;
CREATE POLICY "Users can update their pending links"
  ON pending_managed_links FOR UPDATE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- PENDING PRIOR DATA REVIEW POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own pending reviews" ON pending_prior_data_review;
CREATE POLICY "Users can view their own pending reviews"
  ON pending_prior_data_review FOR SELECT
  USING (subordinate_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own pending reviews" ON pending_prior_data_review;
CREATE POLICY "Users can update their own pending reviews"
  ON pending_prior_data_review FOR UPDATE
  USING (subordinate_id = (select auth.uid()));

-- ============================================================================
-- MANAGED MEMBER HISTORY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Supervisors can view their managed member history" ON managed_member_history;
CREATE POLICY "Supervisors can view their managed member history"
  ON managed_member_history FOR SELECT
  USING (supervisor_id = (select auth.uid()));

-- ============================================================================
-- AWARDS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view awards for members in their chain" ON awards;
CREATE POLICY "Users can view awards for members in their chain"
  ON awards FOR SELECT
  USING (
    recipient_profile_id = (select auth.uid()) OR
    created_by = (select auth.uid()) OR
    supervisor_id = (select auth.uid()) OR
    recipient_profile_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid()))) OR
    recipient_team_member_id IN (SELECT id FROM team_members WHERE supervisor_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Supervisors can insert awards" ON awards;
CREATE POLICY "Supervisors can insert awards"
  ON awards FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND (
      recipient_profile_id IN (SELECT subordinate_id FROM teams WHERE supervisor_id = (select auth.uid())) OR
      recipient_team_member_id IN (SELECT id FROM team_members WHERE supervisor_id = (select auth.uid())) OR
      recipient_profile_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))
    )
  );

DROP POLICY IF EXISTS "Supervisors can update their awards" ON awards;
CREATE POLICY "Supervisors can update their awards"
  ON awards FOR UPDATE
  USING (supervisor_id = (select auth.uid()))
  WITH CHECK (supervisor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Supervisors can delete their awards" ON awards;
CREATE POLICY "Supervisors can delete their awards"
  ON awards FOR DELETE
  USING (supervisor_id = (select auth.uid()));

-- ============================================================================
-- AWARD TEAM MEMBERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Supervisors can manage award team members" ON award_team_members;
CREATE POLICY "Supervisors can manage award team members"
  ON award_team_members FOR ALL
  USING (
    award_id IN (SELECT id FROM awards WHERE supervisor_id = (select auth.uid()))
  );

-- ============================================================================
-- AWARD REQUESTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their requests" ON award_requests;
CREATE POLICY "Users can view their requests"
  ON award_requests FOR SELECT
  USING (
    requester_id = (select auth.uid()) OR 
    approver_id = (select auth.uid()) OR 
    recipient_profile_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can create award requests" ON award_requests;
CREATE POLICY "Users can create award requests"
  ON award_requests FOR INSERT
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their pending requests" ON award_requests;
CREATE POLICY "Users can update their pending requests"
  ON award_requests FOR UPDATE
  USING (
    (requester_id = (select auth.uid()) AND status = 'pending') OR 
    approver_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their pending requests" ON award_requests;
CREATE POLICY "Users can delete their pending requests"
  ON award_requests FOR DELETE
  USING (requester_id = (select auth.uid()) AND status = 'pending');

-- ============================================================================
-- AWARD REQUEST TEAM MEMBERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage request team members" ON award_request_team_members;
CREATE POLICY "Users can manage request team members"
  ON award_request_team_members FOR ALL
  USING (
    request_id IN (SELECT id FROM award_requests WHERE requester_id = (select auth.uid()))
  );

-- ============================================================================
-- USER FEEDBACK POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert feedback" ON user_feedback;
CREATE POLICY "Users can insert feedback"
  ON user_feedback FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own feedback" ON user_feedback;
CREATE POLICY "Users can view own feedback"
  ON user_feedback FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all feedback" ON user_feedback;
CREATE POLICY "Admins can view all feedback"
  ON user_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- ============================================================================
-- EPB SHELLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own shells" ON epb_shells;
CREATE POLICY "Users can view own shells"
  ON epb_shells FOR SELECT
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Users can view shells they created" ON epb_shells;
CREATE POLICY "Users can view shells they created"
  ON epb_shells FOR SELECT
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own shells" ON epb_shells;
CREATE POLICY "Users can create own shells"
  ON epb_shells FOR INSERT
  WITH CHECK (user_id = (select auth.uid()) AND created_by = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Users can update own shells" ON epb_shells;
CREATE POLICY "Users can update own shells"
  ON epb_shells FOR UPDATE
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL)
  WITH CHECK (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Users can delete own shells" ON epb_shells;
CREATE POLICY "Users can delete own shells"
  ON epb_shells FOR DELETE
  USING (user_id = (select auth.uid()) AND team_member_id IS NULL);

DROP POLICY IF EXISTS "Users can view shared shells" ON epb_shells;
CREATE POLICY "Users can view shared shells"
  ON epb_shells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM epb_shell_shares ess
      WHERE ess.shell_id = epb_shells.id AND ess.shared_with_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can view subordinate shells via history" ON epb_shells;
CREATE POLICY "Supervisors can view subordinate shells via history"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id AND th.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can view managed member shells" ON epb_shells;
CREATE POLICY "Supervisors can view managed member shells"
  ON epb_shells FOR SELECT
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id AND tm.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can create shells for any subordinate in chain" ON epb_shells;
CREATE POLICY "Supervisors can create shells for any subordinate in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND
    team_member_id IS NULL AND
    (
      EXISTS (SELECT 1 FROM teams t WHERE t.subordinate_id = epb_shells.user_id AND t.supervisor_id = (select auth.uid())) OR
      EXISTS (SELECT 1 FROM team_history th WHERE th.subordinate_id = epb_shells.user_id AND th.supervisor_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can create shells for managed members in chain" ON epb_shells;
CREATE POLICY "Supervisors can create shells for managed members in chain"
  ON epb_shells FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
        AND (
          tm.supervisor_id = (select auth.uid()) OR
          EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = tm.supervisor_id AND th.supervisor_id = (select auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "Supervisors can update subordinate shells via history" ON epb_shells;
CREATE POLICY "Supervisors can update subordinate shells via history"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND
    EXISTS (
      SELECT 1 FROM team_history th
      WHERE th.subordinate_id = epb_shells.user_id AND th.supervisor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Supervisors can update shells in chain" ON epb_shells;
CREATE POLICY "Supervisors can update shells in chain"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NULL AND (
      EXISTS (SELECT 1 FROM teams t WHERE t.subordinate_id = epb_shells.user_id AND t.supervisor_id = (select auth.uid())) OR
      EXISTS (SELECT 1 FROM team_history th WHERE th.subordinate_id = epb_shells.user_id AND th.supervisor_id = (select auth.uid()))
    )
  )
  WITH CHECK (
    team_member_id IS NULL AND (
      EXISTS (SELECT 1 FROM teams t WHERE t.subordinate_id = epb_shells.user_id AND t.supervisor_id = (select auth.uid())) OR
      EXISTS (SELECT 1 FROM team_history th WHERE th.subordinate_id = epb_shells.user_id AND th.supervisor_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Supervisors can update managed shells in chain" ON epb_shells;
CREATE POLICY "Supervisors can update managed shells in chain"
  ON epb_shells FOR UPDATE
  USING (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
        AND (
          tm.supervisor_id = (select auth.uid()) OR
          EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = tm.supervisor_id AND th.supervisor_id = (select auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    team_member_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = epb_shells.team_member_id
        AND (
          tm.supervisor_id = (select auth.uid()) OR
          EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = tm.supervisor_id AND th.supervisor_id = (select auth.uid())
          )
        )
    )
  );

-- ============================================================================
-- EPB SHELL SECTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert sections for accessible shells" ON epb_shell_sections;
CREATE POLICY "Users can insert sections for accessible shells"
  ON epb_shell_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_sections.shell_id
        AND (
          (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL) OR
          (es.team_member_id IS NULL AND EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = es.user_id AND th.supervisor_id = (select auth.uid())
          )) OR
          (es.team_member_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = es.team_member_id AND tm.supervisor_id = (select auth.uid())
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
          (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL) OR
          (es.team_member_id IS NULL AND EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = es.user_id AND th.supervisor_id = (select auth.uid())
          )) OR
          (es.team_member_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = es.team_member_id AND tm.supervisor_id = (select auth.uid())
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
          (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL) OR
          (es.team_member_id IS NULL AND EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = es.user_id AND th.supervisor_id = (select auth.uid())
          )) OR
          (es.team_member_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = es.team_member_id AND tm.supervisor_id = (select auth.uid())
          ))
        )
    )
  );

-- ============================================================================
-- EPB SHELL SHARES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own shell shares" ON epb_shell_shares;
CREATE POLICY "Users can view own shell shares"
  ON epb_shell_shares FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view shells shared with them" ON epb_shell_shares;
CREATE POLICY "Users can view shells shared with them"
  ON epb_shell_shares FOR SELECT
  USING (shared_with_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create shell shares" ON epb_shell_shares;
CREATE POLICY "Users can create shell shares"
  ON epb_shell_shares FOR INSERT
  WITH CHECK (
    owner_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM epb_shells es
      WHERE es.id = epb_shell_shares.shell_id
        AND (
          (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL) OR
          (es.team_member_id IS NULL AND EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = es.user_id AND th.supervisor_id = (select auth.uid())
          )) OR
          (es.team_member_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = es.team_member_id AND tm.supervisor_id = (select auth.uid())
          ))
        )
    )
  );

DROP POLICY IF EXISTS "Users can delete own shell shares" ON epb_shell_shares;
CREATE POLICY "Users can delete own shell shares"
  ON epb_shell_shares FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================================
-- EPB SHELL SNAPSHOTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert snapshots for accessible sections" ON epb_shell_snapshots;
CREATE POLICY "Users can insert snapshots for accessible sections"
  ON epb_shell_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM epb_shell_sections ess
      JOIN epb_shells es ON es.id = ess.shell_id
      WHERE ess.id = epb_shell_snapshots.section_id
        AND (
          (es.user_id = (select auth.uid()) AND es.team_member_id IS NULL) OR
          (es.team_member_id IS NULL AND EXISTS (
            SELECT 1 FROM team_history th
            WHERE th.subordinate_id = es.user_id AND th.supervisor_id = (select auth.uid())
          )) OR
          (es.team_member_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = es.team_member_id AND tm.supervisor_id = (select auth.uid())
          ))
        )
    )
  );

DROP POLICY IF EXISTS "Users can delete snapshots they created" ON epb_shell_snapshots;
CREATE POLICY "Users can delete snapshots they created"
  ON epb_shell_snapshots FOR DELETE
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- EPB SECTION EDITING SESSIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Host can manage their section sessions" ON epb_section_editing_sessions;
CREATE POLICY "Host can manage their section sessions"
  ON epb_section_editing_sessions FOR ALL
  USING (host_user_id = (select auth.uid()))
  WITH CHECK (host_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view sessions they participate in" ON epb_section_editing_sessions;
CREATE POLICY "Users can view sessions they participate in"
  ON epb_section_editing_sessions FOR SELECT
  USING (host_user_id = (select auth.uid()));

-- ============================================================================
-- EPB SECTION EDITING PARTICIPANTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can join sessions" ON epb_section_editing_participants;
CREATE POLICY "Users can join sessions"
  ON epb_section_editing_participants FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can leave sessions" ON epb_section_editing_participants;
CREATE POLICY "Users can leave sessions"
  ON epb_section_editing_participants FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Host can update participant status" ON epb_section_editing_participants;
CREATE POLICY "Host can update participant status"
  ON epb_section_editing_participants FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Host can remove participants" ON epb_section_editing_participants;
CREATE POLICY "Host can remove participants"
  ON epb_section_editing_participants FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view participants in sessions they host" ON epb_section_editing_participants;
CREATE POLICY "Users can view participants in sessions they host"
  ON epb_section_editing_participants FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM epb_section_editing_sessions WHERE host_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view their own participation" ON epb_section_editing_participants;
CREATE POLICY "Users can view their own participation"
  ON epb_section_editing_participants FOR SELECT
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- EPB SECTION LOCKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view section locks" ON epb_section_locks;
CREATE POLICY "Users can view section locks"
  ON epb_section_locks FOR SELECT
  USING (
    section_id IN (
      SELECT ss.id FROM epb_shell_sections ss
      JOIN epb_shells s ON s.id = ss.shell_id
      WHERE s.user_id = (select auth.uid()) 
        OR s.created_by = (select auth.uid())
        OR s.id IN (SELECT shell_id FROM epb_shell_shares WHERE shared_with_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can manage their own locks" ON epb_section_locks;
CREATE POLICY "Users can manage their own locks"
  ON epb_section_locks FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- EPB SAVED EXAMPLES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view examples for accessible shells" ON epb_saved_examples;
CREATE POLICY "Users can view examples for accessible shells"
  ON epb_saved_examples FOR SELECT
  USING (
    shell_id IN (
      SELECT id FROM epb_shells WHERE user_id = (select auth.uid()) OR created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create examples for accessible shells" ON epb_saved_examples;
CREATE POLICY "Users can create examples for accessible shells"
  ON epb_saved_examples FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid()) AND
    shell_id IN (
      SELECT id FROM epb_shells WHERE user_id = (select auth.uid()) OR created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete examples" ON epb_saved_examples;
CREATE POLICY "Users can delete examples"
  ON epb_saved_examples FOR DELETE
  USING (
    created_by = (select auth.uid()) OR
    shell_id IN (SELECT id FROM epb_shells WHERE user_id = (select auth.uid()))
  );

-- ============================================================================
-- WORKSPACE SESSIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "workspace_sessions_host_all" ON workspace_sessions;
CREATE POLICY "workspace_sessions_host_all"
  ON workspace_sessions FOR ALL
  USING (host_user_id = (select auth.uid()))
  WITH CHECK (host_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view sessions for accessible shells" ON workspace_sessions;
CREATE POLICY "Users can view sessions for accessible shells"
  ON workspace_sessions FOR SELECT
  USING (
    shell_id IS NULL OR user_can_access_shell(shell_id, (select auth.uid()))
  );

-- ============================================================================
-- WORKSPACE SESSION PARTICIPANTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "workspace_participants_insert_self" ON workspace_session_participants;
CREATE POLICY "workspace_participants_insert_self"
  ON workspace_session_participants FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "workspace_participants_update_self" ON workspace_session_participants;
CREATE POLICY "workspace_participants_update_self"
  ON workspace_session_participants FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "workspace_participants_delete_self" ON workspace_session_participants;
CREATE POLICY "workspace_participants_delete_self"
  ON workspace_session_participants FOR DELETE
  USING (user_id = (select auth.uid()));




