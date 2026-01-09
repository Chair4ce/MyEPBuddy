-- Migration: Add remaining FK indexes (batch 2)
-- Fixes 21 unindexed foreign key warnings from database linter

-- award_request_team_members
CREATE INDEX IF NOT EXISTS idx_award_request_team_members_profile_id 
  ON public.award_request_team_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_award_request_team_members_request_id 
  ON public.award_request_team_members(request_id);
CREATE INDEX IF NOT EXISTS idx_award_request_team_members_team_member_id 
  ON public.award_request_team_members(team_member_id);

-- award_requests
CREATE INDEX IF NOT EXISTS idx_award_requests_recipient_profile_id 
  ON public.award_requests(recipient_profile_id);
CREATE INDEX IF NOT EXISTS idx_award_requests_recipient_team_member_id 
  ON public.award_requests(recipient_team_member_id);

-- award_team_members
CREATE INDEX IF NOT EXISTS idx_award_team_members_profile_id 
  ON public.award_team_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_award_team_members_team_member_id 
  ON public.award_team_members(team_member_id);

-- awards
CREATE INDEX IF NOT EXISTS idx_awards_created_by 
  ON public.awards(created_by);

-- community_statements
CREATE INDEX IF NOT EXISTS idx_community_statements_contributor_id 
  ON public.community_statements(contributor_id);
CREATE INDEX IF NOT EXISTS idx_community_statements_refined_statement_id 
  ON public.community_statements(refined_statement_id);

-- epb_saved_examples
CREATE INDEX IF NOT EXISTS idx_epb_saved_examples_created_by 
  ON public.epb_saved_examples(created_by);

-- epb_shell_sections
CREATE INDEX IF NOT EXISTS idx_epb_shell_sections_last_edited_by 
  ON public.epb_shell_sections(last_edited_by);

-- epb_shell_shares
CREATE INDEX IF NOT EXISTS idx_epb_shell_shares_owner_id 
  ON public.epb_shell_shares(owner_id);

-- epb_shell_snapshots
CREATE INDEX IF NOT EXISTS idx_epb_shell_snapshots_created_by 
  ON public.epb_shell_snapshots(created_by);

-- pending_managed_links
CREATE INDEX IF NOT EXISTS idx_pending_managed_links_team_member_id 
  ON public.pending_managed_links(team_member_id);

-- pending_prior_data_review
CREATE INDEX IF NOT EXISTS idx_pending_prior_data_review_prior_team_member_id 
  ON public.pending_prior_data_review(prior_team_member_id);
CREATE INDEX IF NOT EXISTS idx_pending_prior_data_review_supervisor_id 
  ON public.pending_prior_data_review(supervisor_id);

-- refined_statements
CREATE INDEX IF NOT EXISTS idx_refined_statements_history_id 
  ON public.refined_statements(history_id);

-- statement_history
CREATE INDEX IF NOT EXISTS idx_statement_history_ratee_id 
  ON public.statement_history(ratee_id);

-- team_history
CREATE INDEX IF NOT EXISTS idx_team_history_source_team_member_id 
  ON public.team_history(source_team_member_id);

-- user_feedback
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id 
  ON public.user_feedback(user_id);
