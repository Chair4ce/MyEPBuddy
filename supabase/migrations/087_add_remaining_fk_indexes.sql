-- Migration 087: Add Remaining Foreign Key Indexes
-- This migration adds indexes for foreign key columns that are still missing indexes.
-- These were introduced after migration 062 or were missed in that migration.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- ============================================================================
-- ACCOMPLISHMENT COMMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_accomplishment_comments_resolved_by 
  ON accomplishment_comments(resolved_by);

-- ============================================================================
-- ACCOMPLISHMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_accomplishments_team_member_id 
  ON accomplishments(team_member_id);

-- ============================================================================
-- AWARD REQUESTS INDEXES (additional)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_requests_requester_id 
  ON award_requests(requester_id);

-- ============================================================================
-- AWARD SHELL SECTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_shell_sections_last_edited_by 
  ON award_shell_sections(last_edited_by);

-- ============================================================================
-- AWARD SHELL SHARES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_shell_shares_owner_id 
  ON award_shell_shares(owner_id);

-- ============================================================================
-- AWARD SHELL SNAPSHOTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_shell_snapshots_created_by 
  ON award_shell_snapshots(created_by);

-- ============================================================================
-- AWARDS INDEXES (additional)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_awards_supervisor_id 
  ON awards(supervisor_id);

-- ============================================================================
-- EPB DUTY DESCRIPTION EXAMPLES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_duty_desc_examples_created_by 
  ON epb_duty_description_examples(created_by);

-- ============================================================================
-- EPB DUTY DESCRIPTION SNAPSHOTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_duty_desc_snapshots_created_by 
  ON epb_duty_description_snapshots(created_by);

-- ============================================================================
-- EPB SAVED EXAMPLES INDEXES (additional)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_saved_examples_section_id 
  ON epb_saved_examples(section_id);

CREATE INDEX IF NOT EXISTS idx_epb_saved_examples_shell_id 
  ON epb_saved_examples(shell_id);

-- ============================================================================
-- EPB SECTION EDITING PARTICIPANTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_section_editing_participants_user_id 
  ON epb_section_editing_participants(user_id);

-- ============================================================================
-- EPB SECTION EDITING SESSIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_section_editing_sessions_host_user_id 
  ON epb_section_editing_sessions(host_user_id);

-- ============================================================================
-- EPB SECTION LOCKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_section_locks_user_id 
  ON epb_section_locks(user_id);

-- ============================================================================
-- EPB SHELL FIELD LOCKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shell_field_locks_user_id 
  ON epb_shell_field_locks(user_id);

-- ============================================================================
-- EPB SHELL SNAPSHOTS INDEXES (additional)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shell_snapshots_section_id 
  ON epb_shell_snapshots(section_id);

-- ============================================================================
-- EPB SHELLS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shells_created_by 
  ON epb_shells(created_by);

-- ============================================================================
-- MANAGED MEMBER HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_managed_member_history_supervisor_id 
  ON managed_member_history(supervisor_id);

-- ============================================================================
-- REFINED STATEMENTS INDEXES (additional)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_refined_statements_created_by 
  ON refined_statements(created_by);

-- ============================================================================
-- STATEMENT SHARES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_statement_shares_owner_id 
  ON statement_shares(owner_id);

CREATE INDEX IF NOT EXISTS idx_statement_shares_shared_with_id 
  ON statement_shares(shared_with_id);

-- ============================================================================
-- STATEMENT VOTES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_statement_votes_statement_id 
  ON statement_votes(statement_id);

-- ============================================================================
-- TEAM MEMBERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_team_members_linked_user_id 
  ON team_members(linked_user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_original_profile_id 
  ON team_members(original_profile_id);

CREATE INDEX IF NOT EXISTS idx_team_members_parent_profile_id 
  ON team_members(parent_profile_id);

CREATE INDEX IF NOT EXISTS idx_team_members_parent_team_member_id 
  ON team_members(parent_team_member_id);

-- ============================================================================
-- WORKSPACE SESSION PARTICIPANTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workspace_session_participants_user_id 
  ON workspace_session_participants(user_id);

-- ============================================================================
-- WORKSPACE SESSIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_host_user_id 
  ON workspace_sessions(host_user_id);

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_shell_id 
  ON workspace_sessions(shell_id);
