import { PURCHASE_CREDITS } from "@/lib/billing/constants";

export const PURCHASE_CAMPAIGN_METADATA_KEY = "campaign_slug";
export const PURCHASE_CAMPAIGN_DISPLAY_TZ = "America/New_York";

export type PurchaseCampaignOffer = {
  slug: string;
  title: string;
  subtitle: string;
  bonusCredits: number;
  startsAt: string;
  endsAt: string;
  claimed: boolean;
};

export function isCampaignWindowOpen(
  now: Date,
  startsAt: Date,
  endsAt: Date,
): boolean {
  return now.getTime() >= startsAt.getTime() && now.getTime() < endsAt.getTime();
}

export function shouldStampCampaignOnCheckout(params: {
  claimed: boolean;
  windowOpen: boolean;
}): boolean {
  return params.windowOpen && !params.claimed;
}

export function shouldGrantCampaignBonus(params: {
  claimed: boolean;
  windowOpen: boolean;
  stampedSlug: string | null | undefined;
  campaignSlug: string;
}): boolean {
  if (params.claimed) return false;
  if (params.stampedSlug === params.campaignSlug) return true;
  return params.windowOpen;
}

export function featuredSaleTokens(bonusCredits: number): number {
  return PURCHASE_CREDITS + bonusCredits;
}

export function formatCampaignEndsAt(endsAtIso: string): string {
  const ends = new Date(endsAtIso);
  // Exclusive end instant — show the last included local calendar day.
  const lastIncluded = new Date(ends.getTime() - 1);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: PURCHASE_CAMPAIGN_DISPLAY_TZ,
    timeZoneName: "short",
  }).format(lastIncluded);
}
