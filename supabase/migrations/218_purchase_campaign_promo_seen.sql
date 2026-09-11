-- One-time login promo per purchase campaign. Storing the slug (not a boolean)
-- lets the next campaign show again without a data reset.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS purchase_campaign_promo_seen_slug TEXT;

COMMENT ON COLUMN profiles.purchase_campaign_promo_seen_slug IS
  'Last token-purchase campaign slug whose login promo modal was dismissed.';
