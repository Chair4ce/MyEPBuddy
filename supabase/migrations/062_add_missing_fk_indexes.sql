-- Migration 062: Add Missing Foreign Key Indexes
-- This migration adds indexes for foreign key columns that are missing indexes,
-- which can impact database performance during JOINs and cascading operations.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- ============================================================================
-- AWARD REQUEST TEAM MEMBERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_request_team_members_profile_id 
  ON award_request_team_members(profile_id);

CREATE INDEX IF NOT EXISTS idx_award_request_team_members_request_id 
  ON award_request_team_members(request_id);

CREATE INDEX IF NOT EXISTS idx_award_request_team_members_team_member_id 
  ON award_request_team_members(team_member_id);

-- ============================================================================
-- AWARD REQUESTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_requests_recipient_profile_id 
  ON award_requests(recipient_profile_id);

CREATE INDEX IF NOT EXISTS idx_award_requests_recipient_team_member_id 
  ON award_requests(recipient_team_member_id);

-- ============================================================================
-- AWARD TEAM MEMBERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_award_team_members_profile_id 
  ON award_team_members(profile_id);

CREATE INDEX IF NOT EXISTS idx_award_team_members_team_member_id 
  ON award_team_members(team_member_id);

-- ============================================================================
-- AWARDS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_awards_created_by 
  ON awards(created_by);

-- ============================================================================
-- COMMUNITY STATEMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_community_statements_contributor_id 
  ON community_statements(contributor_id);

CREATE INDEX IF NOT EXISTS idx_community_statements_refined_statement_id 
  ON community_statements(refined_statement_id);

-- ============================================================================
-- EPB SAVED EXAMPLES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_saved_examples_created_by 
  ON epb_saved_examples(created_by);

-- ============================================================================
-- EPB SHELL SECTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shell_sections_last_edited_by 
  ON epb_shell_sections(last_edited_by);

-- ============================================================================
-- EPB SHELL SHARES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shell_shares_owner_id 
  ON epb_shell_shares(owner_id);

-- ============================================================================
-- EPB SHELL SNAPSHOTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_epb_shell_snapshots_created_by 
  ON epb_shell_snapshots(created_by);

-- ============================================================================
-- PENDING MANAGED LINKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pending_managed_links_team_member_id 
  ON pending_managed_links(team_member_id);

-- ============================================================================
-- PENDING PRIOR DATA REVIEW INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pending_prior_data_review_prior_team_member_id 
  ON pending_prior_data_review(prior_team_member_id);

CREATE INDEX IF NOT EXISTS idx_pending_prior_data_review_supervisor_id 
  ON pending_prior_data_review(supervisor_id);

-- ============================================================================
-- REFINED STATEMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_refined_statements_history_id 
  ON refined_statements(history_id);

-- ============================================================================
-- STATEMENT HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_statement_history_ratee_id 
  ON statement_history(ratee_id);

-- ============================================================================
-- TEAM HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_team_history_source_team_member_id 
  ON team_history(source_team_member_id);

-- ============================================================================
-- USER FEEDBACK INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id 
  ON user_feedback(user_id);


