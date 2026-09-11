import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";

export function shouldShowPurchaseCampaignPromo(args: {
  onboardingComplete: boolean;
  blockingIntroOpen: boolean;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  campaign: PurchaseCampaignOffer | null;
  seenSlug: string | null | undefined;
  optimisticSeen?: boolean;
}): boolean {
  if (!args.onboardingComplete) return false;
  if (args.blockingIntroOpen) return false;
  if (args.creditsLoading) return false;
  if (args.hasOwnKey) return false;
  if (args.optimisticSeen) return false;
  if (!args.campaign || args.campaign.claimed) return false;
  if (args.seenSlug && args.seenSlug === args.campaign.slug) return false;
  return true;
}
