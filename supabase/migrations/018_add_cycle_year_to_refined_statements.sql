-- Add cycle_year column to refined_statements
-- This allows users to organize statements by performance cycle

ALTER TABLE refined_statements 
ADD COLUMN cycle_year INT;

-- Set default value to current year for existing records
UPDATE refined_statements 
SET cycle_year = EXTRACT(YEAR FROM created_at)::INT 
WHERE cycle_year IS NULL;

-- Now make the column NOT NULL after setting defaults
ALTER TABLE refined_statements 
ALTER COLUMN cycle_year SET NOT NULL;

-- Add index for efficient querying by cycle year
CREATE INDEX idx_refined_statements_cycle_year ON refined_statements(cycle_year);

-- Update the shared_statements_view to include cycle_year
DROP VIEW IF EXISTS shared_statements_view;

CREATE VIEW shared_statements_view AS
SELECT 
  rs.id,
  rs.user_id as owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.is_favorite,
  rs.cycle_year,
  rs.created_at,
  rs.updated_at,
  ss.share_type,
  ss.shared_with_id,
  ss.id as share_id,
  p.full_name as owner_name,
  p.rank as owner_rank
FROM refined_statements rs
JOIN statement_shares ss ON rs.id = ss.statement_id
JOIN profiles p ON rs.user_id = p.id;

-- Grant access to the view
GRANT SELECT ON shared_statements_view TO authenticated;





