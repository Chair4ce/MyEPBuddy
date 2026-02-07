-- Migration: Rework community statements to use dedicated table exclusively
-- 
-- Previously, the community tab merged statements from:
--   1. community_statements table (legacy)
--   2. statement_shares with share_type='community' (cross-query to refined_statements)
-- 
-- This migration ensures community_statements is the ONLY source for the community tab.
-- When a user shares to community, the statement is COPIED to community_statements.
-- When they unshare, it's DELETED from community_statements.
-- Edits to the original statement do NOT propagate to the community copy.

-- Step 1: Add source_statement_id column to track origin (for preventing duplicate shares)
ALTER TABLE community_statements 
ADD COLUMN IF NOT EXISTS source_statement_id UUID REFERENCES refined_statements(id) ON DELETE SET NULL;

-- Index for fast lookup by source_statement_id (used when unsharing)
CREATE INDEX IF NOT EXISTS idx_community_statements_source 
ON community_statements(source_statement_id) WHERE source_statement_id IS NOT NULL;

-- Index for fast lookup by contributor_id (used for delete-own functionality)
CREATE INDEX IF NOT EXISTS idx_community_statements_contributor 
ON community_statements(contributor_id);

-- Step 2: Revert statement_votes FK back to community_statements
-- The FK was changed in migration 129 to reference refined_statements, but since
-- community statements now live exclusively in community_statements table, we revert it.

-- First, delete orphaned votes that reference refined_statements not in community_statements
-- These are votes on statements that were shared via statement_shares but never copied
DELETE FROM statement_votes 
WHERE statement_id NOT IN (SELECT id FROM community_statements);

ALTER TABLE statement_votes 
DROP CONSTRAINT IF EXISTS statement_votes_statement_id_fkey;

ALTER TABLE statement_votes 
ADD CONSTRAINT statement_votes_statement_id_fkey 
FOREIGN KEY (statement_id) REFERENCES community_statements(id) ON DELETE CASCADE;

-- Step 3: Add a DELETE policy for users to delete their own community statements
-- (existing policies only had update, not delete for regular users)
DROP POLICY IF EXISTS "Users can delete own community statements" ON community_statements;
CREATE POLICY "Users can delete own community statements"
  ON community_statements FOR DELETE
  USING ((select auth.uid()) = contributor_id);

-- Step 4: Migrate any existing shared community statements from statement_shares 
-- into community_statements table (one-time data migration)
INSERT INTO community_statements (contributor_id, refined_statement_id, source_statement_id, mpa, afsc, rank, statement, upvotes, is_approved, created_at)
SELECT 
  ss.owner_id,
  ss.statement_id,
  ss.statement_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  0,
  true,
  ss.created_at
FROM statement_shares ss
JOIN refined_statements rs ON rs.id = ss.statement_id
WHERE ss.share_type = 'community'
  AND NOT EXISTS (
    -- Avoid duplicates if already in community_statements
    SELECT 1 FROM community_statements cs 
    WHERE cs.source_statement_id = ss.statement_id
      OR cs.refined_statement_id = ss.statement_id
  );

-- Step 5: Clean up statement_shares community entries (they are now in community_statements)
DELETE FROM statement_shares WHERE share_type = 'community';

-- Step 6: Update bulk_share_epb_statements to handle community shares via community_statements table
CREATE OR REPLACE FUNCTION public.bulk_share_epb_statements(
  p_shell_id UUID,
  p_share_type TEXT,
  p_shared_with_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER := 0;
  v_statement RECORD;
BEGIN
  -- Validate share_type
  IF p_share_type NOT IN ('user', 'team', 'community') THEN
    RAISE EXCEPTION 'Invalid share_type: %', p_share_type;
  END IF;

  -- For 'user' shares, shared_with_id is required
  IF p_share_type = 'user' AND p_shared_with_id IS NULL THEN
    RAISE EXCEPTION 'shared_with_id is required for user shares';
  END IF;

  IF p_share_type = 'community' THEN
    -- For community shares, COPY statements into community_statements table
    FOR v_statement IN 
      SELECT rs.id, rs.user_id, rs.mpa, rs.afsc, rs.rank, rs.statement
      FROM public.refined_statements rs
      WHERE rs.source_epb_shell_id = p_shell_id
      AND rs.user_id = auth.uid()
    LOOP
      -- Insert into community_statements if not already shared
      INSERT INTO public.community_statements (
        contributor_id, refined_statement_id, source_statement_id,
        mpa, afsc, rank, statement, upvotes, is_approved
      )
      SELECT v_statement.user_id, v_statement.id, v_statement.id,
             v_statement.mpa, v_statement.afsc, v_statement.rank,
             v_statement.statement, 0, true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.community_statements cs
        WHERE cs.source_statement_id = v_statement.id
      );
      
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
  ELSE
    -- For user/team shares, use statement_shares table
    FOR v_statement IN 
      SELECT rs.id, rs.user_id
      FROM public.refined_statements rs
      WHERE rs.source_epb_shell_id = p_shell_id
      AND rs.user_id = auth.uid()
    LOOP
      INSERT INTO public.statement_shares (statement_id, owner_id, share_type, shared_with_id)
      VALUES (v_statement.id, v_statement.user_id, p_share_type, p_shared_with_id)
      ON CONFLICT (statement_id, share_type, shared_with_id) DO NOTHING;
      
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Step 7: Update the rating trigger to only work with community_statements table
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
