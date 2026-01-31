-- Migration: Allow rating any statement in the community tab
-- The statement_votes table currently has a foreign key to community_statements,
-- but we also want to allow rating statements shared to community via statement_shares.
-- 
-- Solution: Change the foreign key to reference refined_statements instead,
-- which is the source table for all statements (both community_statements and shared statements).

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE statement_votes 
DROP CONSTRAINT IF EXISTS statement_votes_statement_id_fkey;

-- Step 2: Add new foreign key to refined_statements
-- This allows rating any refined statement that appears in the community tab
ALTER TABLE statement_votes 
ADD CONSTRAINT statement_votes_statement_id_fkey 
FOREIGN KEY (statement_id) REFERENCES refined_statements(id) ON DELETE CASCADE;

-- Step 3: Update the trigger function to handle ratings for any statement
-- For statements shared to community, we track ratings in statement_votes
-- but don't update community_statements (since they're not in that table)
CREATE OR REPLACE FUNCTION update_statement_rating()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only update community_statements if the statement exists there
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
