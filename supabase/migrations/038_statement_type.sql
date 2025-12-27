-- Add statement_type column to refined_statements to distinguish EPB vs Award statements
-- This allows filtering in the Library view and proper categorization

ALTER TABLE refined_statements
ADD COLUMN IF NOT EXISTS statement_type TEXT NOT NULL DEFAULT 'epb' CHECK (statement_type IN ('epb', 'award'));

-- Add index for efficient filtering by statement type
CREATE INDEX IF NOT EXISTS idx_refined_statements_type ON refined_statements(statement_type);

-- Add statement_type to statement_history as well for tracking
ALTER TABLE statement_history
ADD COLUMN IF NOT EXISTS statement_type TEXT NOT NULL DEFAULT 'epb' CHECK (statement_type IN ('epb', 'award'));

-- Update the shared_statements_view to include statement_type
DROP VIEW IF EXISTS shared_statements_view;

CREATE OR REPLACE VIEW shared_statements_view AS
SELECT 
  rs.id,
  rs.user_id AS owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.is_favorite,
  rs.statement_type,
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



