-- Indexes for queries the scaling audit verified in code.
-- Does not change pool size, RLS behavior, or retention.
--
-- api_usage / llm_token_usage: consume_credit and admin_default_key_token_usage
-- filter used_default_key = true AND created_at, without a leading user_id.
-- Existing indexes lead with user_id, so those scans cannot use them.
--
-- accomplishments / refined_statements: list pages filter by owner (and cycle)
-- then order by date or created_at. Existing indexes are single-column or
-- (user_id, cycle_year, statement_type), which does not match that ORDER BY.

CREATE INDEX IF NOT EXISTS idx_api_usage_default_key_created
  ON api_usage (created_at DESC)
  WHERE used_default_key = true;

CREATE INDEX IF NOT EXISTS idx_llm_token_usage_default_key_created
  ON llm_token_usage (created_at DESC)
  WHERE used_default_key = true;

CREATE INDEX IF NOT EXISTS idx_accomplishments_user_cycle_date
  ON accomplishments (user_id, cycle_year, date DESC);

CREATE INDEX IF NOT EXISTS idx_accomplishments_team_member_cycle_date
  ON accomplishments (team_member_id, cycle_year, date DESC)
  WHERE team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refined_statements_user_created
  ON refined_statements (user_id, created_at DESC);
