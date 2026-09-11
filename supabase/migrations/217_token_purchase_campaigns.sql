-- Time-boxed first-purchase token bonuses (e.g. Air Force Birthday weekend).
-- List price stays $1 / 100 tokens. Bonus is granted once per user per campaign
-- after a paid Checkout Session, never from the client.

CREATE TABLE token_purchase_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  bonus_credits INT NOT NULL CHECK (bonus_credits > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT token_purchase_campaigns_window_ck CHECK (ends_at > starts_at)
);

CREATE TABLE token_purchase_campaign_claims (
  campaign_id UUID NOT NULL REFERENCES token_purchase_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_checkout_session_id TEXT NOT NULL,
  granted_credits INT NOT NULL CHECK (granted_credits > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id),
  CONSTRAINT token_purchase_campaign_claims_session_uidx UNIQUE (stripe_checkout_session_id)
);

CREATE INDEX idx_token_purchase_campaigns_active
  ON token_purchase_campaigns (enabled, starts_at, ends_at);

CREATE INDEX idx_token_purchase_campaign_claims_user
  ON token_purchase_campaign_claims (user_id);

ALTER TABLE token_purchase_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_purchase_campaign_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY token_purchase_campaigns_select_authenticated
  ON token_purchase_campaigns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY token_purchase_campaign_claims_select_own
  ON token_purchase_campaign_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE token_purchase_campaigns FROM PUBLIC, anon;
REVOKE ALL ON TABLE token_purchase_campaign_claims FROM PUBLIC, anon;
GRANT SELECT ON TABLE token_purchase_campaigns TO authenticated;
GRANT SELECT ON TABLE token_purchase_campaign_claims TO authenticated;

-- USAF birthday 2026 (18 Sep). Window is Fri 00:00 through Sun 23:59:59.999
-- America/New_York. Copy celebrates the birthday only — that Friday is also
-- National POW/MIA Recognition Day and must not be used as sale framing.
INSERT INTO token_purchase_campaigns (
  slug,
  title,
  subtitle,
  bonus_credits,
  starts_at,
  ends_at
) VALUES (
  'usaf-birthday-2026',
  'Air Force Birthday weekend',
  'Founded 18 September 1947. Your first token purchase this weekend includes 400 bonus tokens — buy 100 for $1 and receive 500.',
  400,
  TIMESTAMPTZ '2026-09-18 00:00:00-04',
  TIMESTAMPTZ '2026-09-21 00:00:00-04'
);

CREATE OR REPLACE FUNCTION claim_purchase_campaign_bonus(
  p_user_id UUID,
  p_campaign_slug TEXT,
  p_stripe_event_id TEXT,
  p_stripe_checkout_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign token_purchase_campaigns%ROWTYPE;
  v_claim token_purchase_campaign_claims%ROWTYPE;
  v_grant_event_id TEXT;
  v_grant_session_id TEXT;
  v_description TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'Access denied: campaign bonus grants are server-initiated only';
  END IF;

  IF p_user_id IS NULL
     OR p_campaign_slug IS NULL
     OR btrim(p_campaign_slug) = ''
     OR p_stripe_event_id IS NULL
     OR btrim(p_stripe_event_id) = ''
     OR p_stripe_checkout_session_id IS NULL
     OR btrim(p_stripe_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'campaign bonus grant is missing required identifiers';
  END IF;

  SELECT * INTO v_campaign
  FROM token_purchase_campaigns
  WHERE slug = p_campaign_slug;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'unknown_campaign');
  END IF;

  INSERT INTO token_purchase_campaign_claims (
    campaign_id,
    user_id,
    stripe_checkout_session_id,
    granted_credits
  ) VALUES (
    v_campaign.id,
    p_user_id,
    p_stripe_checkout_session_id,
    v_campaign.bonus_credits
  )
  ON CONFLICT (campaign_id, user_id) DO UPDATE
    SET campaign_id = token_purchase_campaign_claims.campaign_id
  WHERE token_purchase_campaign_claims.stripe_checkout_session_id
        = EXCLUDED.stripe_checkout_session_id
  RETURNING * INTO v_claim;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_claimed');
  END IF;

  v_grant_event_id := p_stripe_event_id || ':campaign_bonus';
  v_grant_session_id := p_stripe_checkout_session_id || ':campaign_bonus';
  v_description := format(
    '%s — +%s bonus tokens',
    v_campaign.title,
    v_campaign.bonus_credits
  );

  PERFORM grant_credits(
    p_user_id,
    v_campaign.bonus_credits,
    'bonus',
    v_grant_event_id,
    v_description,
    v_grant_session_id
  );

  RETURN jsonb_build_object(
    'granted', true,
    'amount', v_campaign.bonus_credits,
    'reason', 'ok'
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_purchase_campaign_bonus(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_purchase_campaign_bonus(UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE token_purchase_campaigns IS
  'Configured first-purchase token bonus windows. Clients may read; only service_role grants.';
COMMENT ON TABLE token_purchase_campaign_claims IS
  'One bonus claim per user per campaign. Inserts are service_role only.';
COMMENT ON FUNCTION claim_purchase_campaign_bonus(UUID, TEXT, TEXT, TEXT) IS
  'Idempotent first-purchase campaign bonus. Service-role / nested trigger only.';
