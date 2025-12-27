-- Statement History: All generated statements for a user
CREATE TABLE statement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mpa TEXT NOT NULL,
  afsc TEXT NOT NULL,
  rank user_rank NOT NULL,
  original_statement TEXT NOT NULL,
  model_used TEXT NOT NULL,
  cycle_year INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refined Statements: User's personal pool of finalized statements
CREATE TABLE refined_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  history_id UUID REFERENCES statement_history(id) ON DELETE SET NULL,
  mpa TEXT NOT NULL,
  afsc TEXT NOT NULL,
  rank user_rank NOT NULL,
  statement TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Community Statements: Pool of approved statements grouped by AFSC
CREATE TABLE community_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  refined_statement_id UUID REFERENCES refined_statements(id) ON DELETE SET NULL,
  mpa TEXT NOT NULL,
  afsc TEXT NOT NULL,
  rank user_rank NOT NULL,
  statement TEXT NOT NULL,
  upvotes INT NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User preference for style (personal vs community)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS writing_style TEXT NOT NULL DEFAULT 'personal' CHECK (writing_style IN ('personal', 'community', 'hybrid'));

-- Indexes for efficient querying
CREATE INDEX idx_statement_history_user ON statement_history(user_id);
CREATE INDEX idx_statement_history_afsc ON statement_history(afsc);
CREATE INDEX idx_refined_statements_user ON refined_statements(user_id);
CREATE INDEX idx_refined_statements_afsc ON refined_statements(afsc);
CREATE INDEX idx_community_statements_afsc ON community_statements(afsc);
CREATE INDEX idx_community_statements_mpa ON community_statements(mpa);
CREATE INDEX idx_community_statements_rank ON community_statements(rank);

-- Update trigger for refined_statements
CREATE TRIGGER update_refined_statements_updated_at
  BEFORE UPDATE ON refined_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



