-- Create table to track user votes on community statements
CREATE TABLE IF NOT EXISTS statement_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL REFERENCES community_statements(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, statement_id)
);

-- Add downvotes column to community_statements if it doesn't exist
ALTER TABLE community_statements 
ADD COLUMN IF NOT EXISTS downvotes INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE statement_votes ENABLE ROW LEVEL SECURITY;

-- Users can view all votes (to show counts)
CREATE POLICY "Users can view votes"
  ON statement_votes FOR SELECT
  USING (true);

-- Users can insert their own votes
CREATE POLICY "Users can vote"
  ON statement_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own votes
CREATE POLICY "Users can change their vote"
  ON statement_votes FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own votes
CREATE POLICY "Users can remove their vote"
  ON statement_votes FOR DELETE
  USING (user_id = auth.uid());

-- Function to update vote counts on community_statements
CREATE OR REPLACE FUNCTION update_statement_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_type = 'up' THEN
      UPDATE community_statements SET upvotes = upvotes + 1 WHERE id = NEW.statement_id;
    ELSE
      UPDATE community_statements SET downvotes = downvotes + 1 WHERE id = NEW.statement_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote_type = 'up' THEN
      UPDATE community_statements SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.statement_id;
    ELSE
      UPDATE community_statements SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = OLD.statement_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle vote change (up to down or vice versa)
    IF OLD.vote_type = 'up' AND NEW.vote_type = 'down' THEN
      UPDATE community_statements 
      SET upvotes = GREATEST(upvotes - 1, 0), downvotes = downvotes + 1 
      WHERE id = NEW.statement_id;
    ELSIF OLD.vote_type = 'down' AND NEW.vote_type = 'up' THEN
      UPDATE community_statements 
      SET downvotes = GREATEST(downvotes - 1, 0), upvotes = upvotes + 1 
      WHERE id = NEW.statement_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS statement_vote_trigger ON statement_votes;

-- Create trigger
CREATE TRIGGER statement_vote_trigger
AFTER INSERT OR UPDATE OR DELETE ON statement_votes
FOR EACH ROW EXECUTE FUNCTION update_statement_vote_counts();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_statement_votes_user ON statement_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_statement_votes_statement ON statement_votes(statement_id);
CREATE INDEX IF NOT EXISTS idx_community_statements_votes ON community_statements(upvotes DESC, downvotes ASC);



