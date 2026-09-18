-- Civil-date anchors for per-viewer IANA campaign windows.
-- starts_at / ends_at UTC calendar dates are the local start/end dates:
--   local 2026-09-18 00:00 inclusive (Friday)
--   local 2026-09-22 00:00 exclusive (through Sunday night / Monday local)
-- App code evaluates the window in the viewer's timezone. Do not treat these
-- as a single absolute instant for promo / checkout / bonus.
-- PURCHASE_CAMPAIGN_DISPLAY_TZ is no longer used for gating; end-date copy
-- formats in the viewer's TZ.
-- Idempotent. Do not rewrite 217 INSERT or 219.
-- If prod starts_at was shifted to America/Phoenix midnight, this restores
-- date-anchor semantics (UTC Y-M-D 2026-09-18 / 2026-09-22).

UPDATE token_purchase_campaigns
SET
  starts_at = TIMESTAMPTZ '2026-09-18 00:00:00+00',
  ends_at = TIMESTAMPTZ '2026-09-22 00:00:00+00'
WHERE slug = 'usaf-birthday-2026';
