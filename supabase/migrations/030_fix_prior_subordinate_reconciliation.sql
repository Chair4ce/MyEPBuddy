-- Migration: Fix prior subordinate functions and add reconciliation
-- 1. Fix ambiguous column reference in delete_prior_subordinate
-- 2. Add logic to reconcile prior subordinates when re-linked

-- Drop and recreate to fix the ambiguous column issue
DROP FUNCTION IF EXISTS delete_prior_subordinate(uuid, boolean);

CREATE OR REPLACE FUNCTION delete_prior_subordinate(
  p_team_member_id uuid,
  p_delete_data boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries_deleted int := 0;
  v_statements_deleted int := 0;
BEGIN
  -- Verify ownership and status
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.id = p_team_member_id 
      AND tm.supervisor_id = auth.uid()
      AND tm.member_status IN ('prior_subordinate', 'archived')
  ) THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  IF p_delete_data THEN
    -- Delete accomplishments
    DELETE FROM accomplishments WHERE accomplishments.team_member_id = p_team_member_id;
    GET DIAGNOSTICS v_entries_deleted = ROW_COUNT;

    -- Delete statements
    DELETE FROM refined_statements WHERE refined_statements.team_member_id = p_team_member_id;
    GET DIAGNOSTICS v_statements_deleted = ROW_COUNT;
  END IF;

  -- Delete the managed member
  DELETE FROM team_members WHERE team_members.id = p_team_member_id;

  RETURN json_build_object(
    'success', true,
    'entries_deleted', v_entries_deleted,
    'statements_deleted', v_statements_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_prior_subordinate(uuid, boolean) TO authenticated;

-- Function to reconcile prior subordinate when a real relationship is re-established
-- This is called when a team request is accepted
CREATE OR REPLACE FUNCTION reconcile_prior_subordinate_on_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior_member team_members%ROWTYPE;
  v_entry_count int := 0;
  v_statement_count int := 0;
BEGIN
  -- Check if supervisor has a prior_subordinate record for this subordinate
  SELECT * INTO v_prior_member
  FROM team_members
  WHERE supervisor_id = NEW.supervisor_id
    AND (original_profile_id = NEW.subordinate_id OR linked_user_id = NEW.subordinate_id)
    AND member_status IN ('prior_subordinate', 'archived');

  IF v_prior_member.id IS NOT NULL THEN
    -- Count entries and statements that need review
    SELECT COUNT(*) INTO v_entry_count
    FROM accomplishments
    WHERE team_member_id = v_prior_member.id;

    SELECT COUNT(*) INTO v_statement_count
    FROM refined_statements
    WHERE team_member_id = v_prior_member.id;

    IF v_entry_count > 0 OR v_statement_count > 0 THEN
      -- Create a pending review record for the subordinate
      -- The subordinate can review entries/statements created during the prior period
      INSERT INTO pending_prior_data_review (
        subordinate_id,
        supervisor_id,
        prior_team_member_id,
        entry_count,
        statement_count,
        created_at
      ) VALUES (
        NEW.subordinate_id,
        NEW.supervisor_id,
        v_prior_member.id,
        v_entry_count,
        v_statement_count,
        now()
      )
      ON CONFLICT (subordinate_id, prior_team_member_id) DO NOTHING;
    ELSE
      -- No data to review, just delete the prior member
      DELETE FROM team_members WHERE id = v_prior_member.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create table for pending prior data reviews
CREATE TABLE IF NOT EXISTS pending_prior_data_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subordinate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prior_team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  entry_count int DEFAULT 0,
  statement_count int DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(subordinate_id, prior_team_member_id)
);

-- RLS for pending_prior_data_review
ALTER TABLE pending_prior_data_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pending reviews"
  ON pending_prior_data_review FOR SELECT
  USING (subordinate_id = auth.uid());

CREATE POLICY "Users can update their own pending reviews"
  ON pending_prior_data_review FOR UPDATE
  USING (subordinate_id = auth.uid());

-- Trigger on teams table after insert
DROP TRIGGER IF EXISTS trigger_reconcile_prior_subordinate ON teams;
CREATE TRIGGER trigger_reconcile_prior_subordinate
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION reconcile_prior_subordinate_on_accept();

-- Function to accept prior data (transfers entries/statements to real user)
CREATE OR REPLACE FUNCTION accept_prior_data_review(p_review_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review pending_prior_data_review%ROWTYPE;
  v_entries_transferred int := 0;
  v_statements_transferred int := 0;
BEGIN
  -- Get and validate the review
  SELECT * INTO v_review
  FROM pending_prior_data_review
  WHERE id = p_review_id AND subordinate_id = auth.uid() AND status = 'pending';

  IF v_review.id IS NULL THEN
    RAISE EXCEPTION 'Review not found or not authorized';
  END IF;

  -- Transfer entries to real user
  UPDATE accomplishments
  SET user_id = v_review.subordinate_id,
      team_member_id = NULL
  WHERE team_member_id = v_review.prior_team_member_id;
  GET DIAGNOSTICS v_entries_transferred = ROW_COUNT;

  -- Transfer statements to real user
  UPDATE refined_statements
  SET user_id = v_review.subordinate_id,
      team_member_id = NULL
  WHERE team_member_id = v_review.prior_team_member_id;
  GET DIAGNOSTICS v_statements_transferred = ROW_COUNT;

  -- Delete the prior team member
  DELETE FROM team_members WHERE id = v_review.prior_team_member_id;

  -- Mark review as accepted
  UPDATE pending_prior_data_review
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_review_id;

  RETURN json_build_object(
    'success', true,
    'entries_transferred', v_entries_transferred,
    'statements_transferred', v_statements_transferred
  );
END;
$$;

-- Function to reject prior data (deletes the prior member and its data)
CREATE OR REPLACE FUNCTION reject_prior_data_review(p_review_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review pending_prior_data_review%ROWTYPE;
BEGIN
  -- Get and validate the review
  SELECT * INTO v_review
  FROM pending_prior_data_review
  WHERE id = p_review_id AND subordinate_id = auth.uid() AND status = 'pending';

  IF v_review.id IS NULL THEN
    RAISE EXCEPTION 'Review not found or not authorized';
  END IF;

  -- Delete entries
  DELETE FROM accomplishments WHERE team_member_id = v_review.prior_team_member_id;

  -- Delete statements
  DELETE FROM refined_statements WHERE team_member_id = v_review.prior_team_member_id;

  -- Delete the prior team member
  DELETE FROM team_members WHERE id = v_review.prior_team_member_id;

  -- Mark review as rejected
  UPDATE pending_prior_data_review
  SET status = 'rejected', resolved_at = now()
  WHERE id = p_review_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_prior_data_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_prior_data_review(uuid) TO authenticated;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_prior_data_review_subordinate 
  ON pending_prior_data_review(subordinate_id, status);



