-- Migration: Convert upvote/downvote system to 5-star rating system
-- This replaces the vote_type ('up'/'down') with a numeric rating (1-5)

-- Step 1: Add new columns for star rating system
ALTER TABLE community_statements 
ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Step 2: Modify statement_votes table to use numeric rating instead of vote_type
-- First, drop the existing trigger that depends on vote_type
DROP TRIGGER IF EXISTS statement_vote_trigger ON statement_votes;

-- Drop the old function
DROP FUNCTION IF EXISTS update_statement_vote_counts();

-- Add rating column (1-5 stars)
ALTER TABLE statement_votes 
ADD COLUMN IF NOT EXISTS rating INTEGER;

-- Migrate existing votes: up = 5 stars, down = 1 star
UPDATE statement_votes 
SET rating = CASE 
  WHEN vote_type = 'up' THEN 5 
  WHEN vote_type = 'down' THEN 1 
  ELSE 3 
END
WHERE rating IS NULL;

-- Make rating required and add constraint
ALTER TABLE statement_votes 
ALTER COLUMN rating SET NOT NULL;

ALTER TABLE statement_votes 
ADD CONSTRAINT statement_votes_rating_check CHECK (rating >= 1 AND rating <= 5);

-- Drop the old vote_type column and its constraint
ALTER TABLE statement_votes 
DROP CONSTRAINT IF EXISTS statement_votes_vote_type_check;

ALTER TABLE statement_votes 
DROP COLUMN IF EXISTS vote_type;

-- Step 3: Create new function to update average rating
CREATE OR REPLACE FUNCTION update_statement_rating()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_statements 
    SET 
      rating_count = rating_count + 1,
      average_rating = (
        SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 0) 
        FROM statement_votes 
        WHERE statement_id = NEW.statement_id
      )
    WHERE id = NEW.statement_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_statements 
    SET 
      rating_count = GREATEST(rating_count - 1, 0),
      average_rating = (
        SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 0) 
        FROM statement_votes 
        WHERE statement_id = OLD.statement_id
      )
    WHERE id = OLD.statement_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE community_statements 
    SET 
      average_rating = (
        SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 0) 
        FROM statement_votes 
        WHERE statement_id = NEW.statement_id
      )
    WHERE id = NEW.statement_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger for the new rating system
CREATE TRIGGER statement_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON statement_votes
FOR EACH ROW EXECUTE FUNCTION update_statement_rating();

-- Step 5: Migrate existing vote counts to ratings
-- Calculate average_rating and rating_count from existing votes
UPDATE community_statements cs
SET 
  rating_count = (
    SELECT COUNT(*) FROM statement_votes sv WHERE sv.statement_id = cs.id
  ),
  average_rating = (
    SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 0) 
    FROM statement_votes sv 
    WHERE sv.statement_id = cs.id
  );

-- Step 6: Create index for sorting by average rating
CREATE INDEX IF NOT EXISTS idx_community_statements_rating 
ON community_statements(average_rating DESC, rating_count DESC);

-- Note: We keep upvotes and downvotes columns for backward compatibility
-- They can be removed in a future migration after confirming everything works
