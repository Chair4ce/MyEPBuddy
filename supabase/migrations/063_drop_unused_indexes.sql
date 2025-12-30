-- Migration: Drop Unused Indexes
-- These indexes have never been used according to Supabase performance advisors.
-- Removing them will:
--   1. Reduce storage overhead
--   2. Speed up INSERT/UPDATE/DELETE operations
--   3. Reduce database maintenance costs
--
-- Note: If any of these indexes become needed in the future, they can be recreated.

-- ============================================================================
-- STATEMENT & COMMUNITY TABLES
-- ============================================================================

-- statement_shares
DROP INDEX IF EXISTS idx_statement_shares_owner;
DROP INDEX IF EXISTS idx_statement_shares_shared_with;

-- statement_history
DROP INDEX IF EXISTS idx_statement_history_afsc;
DROP INDEX IF EXISTS idx_statement_history_ratee_id;

-- statement_votes
DROP INDEX IF EXISTS idx_statement_votes_statement;

-- community_statements
DROP INDEX IF EXISTS idx_community_statements_mpa;
DROP INDEX IF EXISTS idx_community_statements_rank;
DROP INDEX IF EXISTS idx_community_statements_votes;
DROP INDEX IF EXISTS idx_community_statements_contributor_id;
DROP INDEX IF EXISTS idx_community_statements_refined_statement_id;

-- refined_statements
DROP INDEX IF EXISTS idx_refined_statements_created_by;
DROP INDEX IF EXISTS idx_refined_statements_team_member;
DROP INDEX IF EXISTS idx_refined_statements_type;
DROP INDEX IF EXISTS idx_refined_statements_history_id;

-- ============================================================================
-- TEAM & MEMBER TABLES
-- ============================================================================

-- teams
DROP INDEX IF EXISTS idx_teams_supervision_dates;

-- team_members
DROP INDEX IF EXISTS idx_team_members_parent;
DROP INDEX IF EXISTS idx_team_members_parent_member;
DROP INDEX IF EXISTS idx_team_members_email;
DROP INDEX IF EXISTS idx_team_members_linked_user;
DROP INDEX IF EXISTS idx_team_members_status;
DROP INDEX IF EXISTS idx_team_members_original_profile;
DROP INDEX IF EXISTS idx_team_members_supervision_dates;

-- team_history
DROP INDEX IF EXISTS idx_team_history_active;
DROP INDEX IF EXISTS idx_team_history_source_team_member_id;

-- managed_member_history
DROP INDEX IF EXISTS idx_managed_member_history_supervisor;

-- ============================================================================
-- AWARDS TABLES
-- ============================================================================

-- awards
DROP INDEX IF EXISTS idx_awards_supervisor;
DROP INDEX IF EXISTS idx_awards_type;
DROP INDEX IF EXISTS idx_awards_cycle_year;
DROP INDEX IF EXISTS idx_awards_created_by;

-- award_team_members
DROP INDEX IF EXISTS idx_award_team_members_award;
DROP INDEX IF EXISTS idx_award_team_members_profile_id;
DROP INDEX IF EXISTS idx_award_team_members_team_member_id;

-- award_requests
DROP INDEX IF EXISTS idx_award_requests_requester;
DROP INDEX IF EXISTS idx_award_requests_status;
DROP INDEX IF EXISTS idx_award_requests_recipient_profile_id;
DROP INDEX IF EXISTS idx_award_requests_recipient_team_member_id;

-- award_request_team_members
DROP INDEX IF EXISTS idx_award_request_team_members_team_member_id;
DROP INDEX IF EXISTS idx_award_request_team_members_profile_id;
DROP INDEX IF EXISTS idx_award_request_team_members_request_id;

-- ============================================================================
-- EPB SHELL TABLES
-- ============================================================================

-- epb_shells
DROP INDEX IF EXISTS idx_epb_shells_user;
DROP INDEX IF EXISTS idx_epb_shells_created_by;
DROP INDEX IF EXISTS idx_epb_shells_cycle_year;

-- epb_shell_sections
DROP INDEX IF EXISTS idx_epb_shell_sections_last_edited_by;
DROP INDEX IF EXISTS idx_epb_shell_sections_shell;
DROP INDEX IF EXISTS idx_epb_shell_sections_mpa;

-- epb_shell_shares
DROP INDEX IF EXISTS idx_epb_shell_shares_owner_id;
DROP INDEX IF EXISTS idx_epb_shell_shares_shell;

-- epb_shell_snapshots
DROP INDEX IF EXISTS idx_epb_shell_snapshots_created_by;
DROP INDEX IF EXISTS idx_epb_shell_snapshots_section;
DROP INDEX IF EXISTS idx_epb_shell_snapshots_created_at;

-- epb_saved_examples
DROP INDEX IF EXISTS idx_epb_saved_examples_created_by;
DROP INDEX IF EXISTS idx_epb_saved_examples_section;
DROP INDEX IF EXISTS idx_epb_saved_examples_shell;

-- ============================================================================
-- EPB SECTION EDITING (COLLABORATION) TABLES
-- ============================================================================

-- epb_section_editing_sessions
DROP INDEX IF EXISTS idx_epb_section_sessions_section;
DROP INDEX IF EXISTS idx_epb_section_sessions_host;
DROP INDEX IF EXISTS idx_epb_section_sessions_code;
DROP INDEX IF EXISTS idx_epb_section_sessions_active;

-- epb_section_editing_participants
DROP INDEX IF EXISTS idx_epb_section_participants_session;
DROP INDEX IF EXISTS idx_epb_section_participants_user;

-- epb_section_locks
DROP INDEX IF EXISTS idx_section_locks_section;
DROP INDEX IF EXISTS idx_section_locks_user;
DROP INDEX IF EXISTS idx_section_locks_expires;

-- ============================================================================
-- WORKSPACE SESSION TABLES
-- ============================================================================

-- workspace_sessions
DROP INDEX IF EXISTS idx_workspace_sessions_host;
DROP INDEX IF EXISTS idx_workspace_sessions_active;
DROP INDEX IF EXISTS idx_workspace_sessions_shell;

-- workspace_session_participants
DROP INDEX IF EXISTS idx_workspace_participants_session;
DROP INDEX IF EXISTS idx_workspace_participants_user;

-- ============================================================================
-- PENDING/REVIEW TABLES
-- ============================================================================

-- pending_managed_links
DROP INDEX IF EXISTS idx_pending_managed_links_team_member_id;

-- pending_prior_data_review
DROP INDEX IF EXISTS idx_pending_prior_data_review_prior_team_member_id;
DROP INDEX IF EXISTS idx_pending_prior_data_review_supervisor_id;

-- ============================================================================
-- USER TABLES
-- ============================================================================

-- profiles
DROP INDEX IF EXISTS idx_profiles_terms_accepted;

-- user_feedback
DROP INDEX IF EXISTS idx_user_feedback_feature;
DROP INDEX IF EXISTS idx_user_feedback_created_at;
DROP INDEX IF EXISTS idx_user_feedback_user_id;

-- ============================================================================
-- ACCOMPLISHMENTS TABLE
-- ============================================================================

-- accomplishments
DROP INDEX IF EXISTS idx_accomplishments_team_member;




