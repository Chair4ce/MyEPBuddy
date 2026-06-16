-- One-time reset so existing users see the earn-tokens onboarding step after rollout.
-- Safe to run once: dismissals after this migration persist via earn_tokens_intro_seen_at.

UPDATE profiles
SET earn_tokens_intro_seen_at = NULL
WHERE earn_tokens_intro_seen_at IS NOT NULL
