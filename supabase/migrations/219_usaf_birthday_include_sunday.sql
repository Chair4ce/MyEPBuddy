-- Extend USAF birthday 2026 exclusive end through Sunday 21 Sep 23:59:59.999 ET.
-- Do not rewrite 217's INSERT; prod may already have this ends_at.

UPDATE token_purchase_campaigns
SET ends_at = TIMESTAMPTZ '2026-09-22 00:00:00-04'
WHERE slug = 'usaf-birthday-2026';
