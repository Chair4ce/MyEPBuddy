import { createAdminClient } from "@/lib/supabase/server";
import {
  isCampaignWindowOpen,
  shouldGrantCampaignBonus,
  shouldStampCampaignOnCheckout,
  type PurchaseCampaignOffer,
} from "@/lib/billing/purchase-campaign";

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  bonus_credits: number;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
};

function toOffer(
  row: CampaignRow,
  claimed: boolean,
): PurchaseCampaignOffer {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    bonusCredits: row.bonus_credits,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    claimed,
  };
}

async function loadCampaignBySlug(slug: string): Promise<CampaignRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("token_purchase_campaigns" as never)
    .select(
      "id, slug, title, subtitle, bonus_credits, starts_at, ends_at, enabled",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[purchase-campaign] load by slug failed:", error.message);
    return null;
  }

  return (data as CampaignRow | null) ?? null;
}

function previewCampaignSlug(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const slug = process.env.PURCHASE_CAMPAIGN_PREVIEW_SLUG?.trim();
  return slug || null;
}

async function loadActiveCampaign(now: Date): Promise<CampaignRow | null> {
  const previewSlug = previewCampaignSlug();
  if (previewSlug) {
    const preview = await loadCampaignBySlug(previewSlug);
    if (preview) return preview;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("token_purchase_campaigns" as never)
    .select(
      "id, slug, title, subtitle, bonus_credits, starts_at, ends_at, enabled",
    )
    .eq("enabled", true)
    .lte("starts_at", now.toISOString())
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[purchase-campaign] load active failed:", error.message);
    return null;
  }

  return (data as CampaignRow | null) ?? null;
}

async function hasCampaignClaim(
  campaignId: string,
  userId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("token_purchase_campaign_claims" as never)
    .select("user_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[purchase-campaign] claim lookup failed:", error.message);
    return false;
  }

  return data !== null;
}

export async function getVisiblePurchaseCampaign(
  userId: string,
  now: Date = new Date(),
): Promise<PurchaseCampaignOffer | null> {
  const campaign = await loadActiveCampaign(now);
  if (!campaign) return null;
  const claimed = await hasCampaignClaim(campaign.id, userId);
  return toOffer(campaign, claimed);
}

export async function resolveCheckoutCampaignSlug(
  userId: string,
  now: Date = new Date(),
): Promise<string | undefined> {
  const offer = await getVisiblePurchaseCampaign(userId, now);
  if (!offer) return undefined;
  if (
    !shouldStampCampaignOnCheckout({
      claimed: offer.claimed,
      windowOpen: true,
    })
  ) {
    return undefined;
  }
  return offer.slug;
}

export async function resolveCampaignBonusGrant(params: {
  userId: string;
  stampedSlug: string | null | undefined;
  now?: Date;
}): Promise<{ slug: string } | null> {
  const now = params.now ?? new Date();
  const stamped = params.stampedSlug?.trim() || null;

  const campaign = stamped
    ? await loadCampaignBySlug(stamped)
    : await loadActiveCampaign(now);

  if (!campaign) return null;

  const windowOpen = isCampaignWindowOpen(
    now,
    new Date(campaign.starts_at),
    new Date(campaign.ends_at),
  );
  const claimed = await hasCampaignClaim(campaign.id, params.userId);

  if (
    !shouldGrantCampaignBonus({
      claimed,
      windowOpen,
      stampedSlug: stamped,
      campaignSlug: campaign.slug,
    })
  ) {
    return null;
  }

  return { slug: campaign.slug };
}

export async function grantPurchaseCampaignBonus(params: {
  userId: string;
  campaignSlug: string;
  stripeEventId: string;
  stripeCheckoutSessionId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase.rpc as Function)(
    "claim_purchase_campaign_bonus",
    {
      p_user_id: params.userId,
      p_campaign_slug: params.campaignSlug,
      p_stripe_event_id: params.stripeEventId,
      p_stripe_checkout_session_id: params.stripeCheckoutSessionId,
    },
  );

  if (error) {
    throw new Error(`claim_purchase_campaign_bonus failed: ${error.message}`);
  }

  const result = data as { granted?: boolean; reason?: string } | null;
  if (result?.reason === "unknown_campaign") {
    console.error("[purchase-campaign] unknown campaign slug", params.campaignSlug);
  }
}
