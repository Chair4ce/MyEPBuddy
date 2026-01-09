-- Migration: Fix security definer view warning
-- Changes archived_epbs_view to use SECURITY INVOKER so RLS policies
-- are evaluated for the querying user, not the view creator

-- Drop and recreate the view with security_invoker enabled
DROP VIEW IF EXISTS archived_epbs_view;

CREATE VIEW archived_epbs_view 
WITH (security_invoker = on)
AS
SELECT 
  es.id,
  es.user_id,
  es.team_member_id,
  es.cycle_year,
  es.archive_name,
  es.archived_at,
  es.created_at,
  -- Get ratee info
  CASE 
    WHEN es.team_member_id IS NOT NULL THEN tm.full_name
    ELSE p.full_name
  END AS ratee_name,
  CASE 
    WHEN es.team_member_id IS NOT NULL THEN tm.rank
    ELSE p.rank
  END AS ratee_rank,
  -- Count of statements saved from this EPB
  (
    SELECT COUNT(*) 
    FROM refined_statements rs 
    WHERE rs.source_epb_shell_id = es.id
  ) AS statement_count
FROM epb_shells es
LEFT JOIN profiles p ON p.id = es.user_id AND es.team_member_id IS NULL
LEFT JOIN team_members tm ON tm.id = es.team_member_id
WHERE es.status = 'archived';

-- Grant appropriate permissions
GRANT SELECT ON archived_epbs_view TO authenticated;
