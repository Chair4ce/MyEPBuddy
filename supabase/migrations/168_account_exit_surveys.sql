-- Account exit surveys and one-time post-deletion survey tokens

CREATE TABLE account_exit_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT CHECK (
    reason IS NULL OR reason IN (
      'not_using',
      'missing_features',
      'too_expensive',
      'found_alternative',
      'privacy_concerns',
      'too_complicated',
      'other'
    )
  ),
  comments TEXT CHECK (comments IS NULL OR char_length(comments) <= 2000),
  source TEXT NOT NULL DEFAULT 'deletion_dialog' CHECK (
    source IN ('deletion_dialog', 'goodbye_page')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_exit_surveys_created_at
  ON account_exit_surveys (created_at DESC);

CREATE TABLE account_exit_survey_tokens (
  token TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_exit_survey_tokens_expires
  ON account_exit_survey_tokens (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE account_exit_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_exit_survey_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can read exit surveys (inserts happen via service role)
CREATE POLICY "Admins can view account exit surveys"
  ON account_exit_surveys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'admin'
    )
  );
