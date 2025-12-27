-- Fix profiles RLS: Allow searching profiles by email for team invitations
CREATE POLICY "Users can search profiles by email"
  ON profiles FOR SELECT
  USING (true); -- Allow reading basic profile info for team building

-- Drop the restrictive policies and replace with more permissive read
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Supervisors can view subordinates profiles" ON profiles;

-- Team Requests table for invitation system
CREATE TABLE team_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('supervise', 'be_supervised')),
  -- 'supervise' = requester wants to be the supervisor of target
  -- 'be_supervised' = requester wants target to be their supervisor
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(requester_id, target_id, status) -- Prevent duplicate pending requests
);

-- Enable RLS
ALTER TABLE team_requests ENABLE ROW LEVEL SECURITY;

-- Team Requests Policies
CREATE POLICY "Users can view requests involving them"
  ON team_requests FOR SELECT
  USING (requester_id = auth.uid() OR target_id = auth.uid());

CREATE POLICY "Users can create requests"
  ON team_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Target users can update request status"
  ON team_requests FOR UPDATE
  USING (target_id = auth.uid())
  WITH CHECK (target_id = auth.uid());

CREATE POLICY "Requesters can delete pending requests"
  ON team_requests FOR DELETE
  USING (requester_id = auth.uid() AND status = 'pending');

-- Index for efficient queries
CREATE INDEX idx_team_requests_requester ON team_requests(requester_id);
CREATE INDEX idx_team_requests_target ON team_requests(target_id);
CREATE INDEX idx_team_requests_status ON team_requests(status);

-- Function to get all subordinates in the chain (recursive)
CREATE OR REPLACE FUNCTION get_subordinate_chain(supervisor_uuid UUID)
RETURNS TABLE(subordinate_id UUID, depth INT) AS $$
WITH RECURSIVE chain AS (
  -- Direct subordinates (depth 1)
  SELECT t.subordinate_id, 1 as depth
  FROM teams t
  WHERE t.supervisor_id = supervisor_uuid
  
  UNION ALL
  
  -- Subordinates of subordinates (depth + 1)
  SELECT t.subordinate_id, c.depth + 1
  FROM teams t
  INNER JOIN chain c ON t.supervisor_id = c.subordinate_id
  WHERE c.depth < 10 -- Prevent infinite loops, max 10 levels deep
)
SELECT * FROM chain;
$$ LANGUAGE SQL STABLE;

-- Function to get all supervisors in the chain (up the chain)
CREATE OR REPLACE FUNCTION get_supervisor_chain(subordinate_uuid UUID)
RETURNS TABLE(supervisor_id UUID, depth INT) AS $$
WITH RECURSIVE chain AS (
  -- Direct supervisor (depth 1)
  SELECT t.supervisor_id, 1 as depth
  FROM teams t
  WHERE t.subordinate_id = subordinate_uuid
  
  UNION ALL
  
  -- Supervisor of supervisors (depth + 1)
  SELECT t.supervisor_id, c.depth + 1
  FROM teams t
  INNER JOIN chain c ON t.subordinate_id = c.supervisor_id
  WHERE c.depth < 10 -- Prevent infinite loops
)
SELECT * FROM chain;
$$ LANGUAGE SQL STABLE;

-- Update accomplishments RLS to allow chain visibility
CREATE POLICY "Chain supervisors can view subordinate chain accomplishments"
  ON accomplishments FOR SELECT
  USING (
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );

-- Update statement_history RLS for chain visibility
CREATE POLICY "Chain supervisors can view subordinate chain statement history"
  ON statement_history FOR SELECT
  USING (
    ratee_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );

-- Update refined_statements RLS for chain visibility  
CREATE POLICY "Chain supervisors can view subordinate chain refined statements"
  ON refined_statements FOR SELECT
  USING (
    user_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
  );



