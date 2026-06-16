-- One-time "ways to earn tokens" announcement modal (per profile).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS earn_tokens_intro_seen_at TIMESTAMPTZ

COMMENT ON COLUMN profiles.earn_tokens_intro_seen_at IS
  'When the user dismissed the earn-tokens introduction modal.'
