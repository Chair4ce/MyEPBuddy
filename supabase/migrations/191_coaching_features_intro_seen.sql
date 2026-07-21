-- One-time intro for cycle coaching / feedback features (all users).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coaching_features_intro_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.coaching_features_intro_seen_at IS
  'When the user dismissed the coaching features introduction modal.';
