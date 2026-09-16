-- Exclusive end 2026-09-22 00:00 America/New_York (EDT / UTC-4).
-- Last included instant is 2026-09-21 23:59:59.999 ET. Idempotent on slug.
-- Do not rewrite 217's INSERT; prod may already have this ends_at.

UPDATE token_purchase_campaigns
SET ends_at = TIMESTAMPTZ '2026-09-22 00:00:00-04'
WHERE slug = 'usaf-birthday-2026';
