-- Statement Sharing System
-- This migration creates the infrastructure for sharing statements between users
-- with granular control (individual users, team, or community)

-- Statement Shares table for granular sharing
-- share_type: 'user' (specific user), 'team' (all team members), 'community' (everyone)
CREATE TABLE statement_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES refined_statements(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL CHECK (share_type IN ('user', 'team', 'community')),
  -- shared_with_id is NULL for 'team' and 'community' shares, specific user_id for 'user' shares
  shared_with_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure unique shares per statement/target combination
  UNIQUE(statement_id, share_type, shared_with_id)
);

-- Remove the existing RLS policies that give supervisors automatic visibility to refined_statements
DROP POLICY IF EXISTS "Chain supervisors can view subordinate chain refined statements" ON refined_statements;

-- Enable RLS
ALTER TABLE statement_shares ENABLE ROW LEVEL SECURITY;

-- Statement Shares Policies

-- Owners can view their own shares
CREATE POLICY "Users can view own shares"
  ON statement_shares FOR SELECT
  USING (owner_id = auth.uid());

-- Users can see shares that include them
CREATE POLICY "Users can view shares for them"
  ON statement_shares FOR SELECT
  USING (
    share_type = 'user' AND shared_with_id = auth.uid()
  );

-- Users can see team shares if they are on the owner's team
CREATE POLICY "Users can view team shares"
  ON statement_shares FOR SELECT
  USING (
    share_type = 'team' AND (
      -- User is a subordinate of the owner
      auth.uid() IN (SELECT subordinate_id FROM teams WHERE supervisor_id = owner_id)
      OR
      -- User is a supervisor of the owner
      auth.uid() IN (SELECT supervisor_id FROM teams WHERE subordinate_id = owner_id)
      OR
      -- User shares a supervisor with the owner (teammates)
      EXISTS (
        SELECT 1 FROM teams t1
        JOIN teams t2 ON t1.supervisor_id = t2.supervisor_id
        WHERE t1.subordinate_id = owner_id AND t2.subordinate_id = auth.uid()
      )
    )
  );

-- Users can see community shares
CREATE POLICY "Users can view community shares"
  ON statement_shares FOR SELECT
  USING (share_type = 'community');

-- Owners can insert their own shares
CREATE POLICY "Users can create own shares"
  ON statement_shares FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Owners can delete their own shares
CREATE POLICY "Users can delete own shares"
  ON statement_shares FOR DELETE
  USING (owner_id = auth.uid());

-- Create indexes for efficient queries
CREATE INDEX idx_statement_shares_statement ON statement_shares(statement_id);
CREATE INDEX idx_statement_shares_owner ON statement_shares(owner_id);
CREATE INDEX idx_statement_shares_shared_with ON statement_shares(shared_with_id);
CREATE INDEX idx_statement_shares_type ON statement_shares(share_type);

-- Update refined_statements to allow viewing shared statements
-- Create a policy that allows viewing statements that have been shared with the user
CREATE POLICY "Users can view shared statements"
  ON refined_statements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM statement_shares ss
      WHERE ss.statement_id = refined_statements.id
      AND (
        -- Direct user share
        (ss.share_type = 'user' AND ss.shared_with_id = auth.uid())
        OR
        -- Team share - user is on owner's team
        (ss.share_type = 'team' AND (
          auth.uid() IN (SELECT subordinate_id FROM teams WHERE supervisor_id = ss.owner_id)
          OR auth.uid() IN (SELECT supervisor_id FROM teams WHERE subordinate_id = ss.owner_id)
          OR EXISTS (
            SELECT 1 FROM teams t1
            JOIN teams t2 ON t1.supervisor_id = t2.supervisor_id
            WHERE t1.subordinate_id = ss.owner_id AND t2.subordinate_id = auth.uid()
          )
        ))
        OR
        -- Community share - everyone can see
        ss.share_type = 'community'
      )
    )
  );

-- View to get statements shared with a user (for efficient querying)
CREATE OR REPLACE VIEW shared_statements_view AS
SELECT 
  rs.id,
  rs.user_id AS owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.is_favorite,
  rs.created_at,
  rs.updated_at,
  ss.share_type,
  ss.shared_with_id,
  ss.id AS share_id,
  p.full_name AS owner_name,
  p.rank AS owner_rank
FROM refined_statements rs
JOIN statement_shares ss ON ss.statement_id = rs.id
JOIN profiles p ON p.id = rs.user_id;





