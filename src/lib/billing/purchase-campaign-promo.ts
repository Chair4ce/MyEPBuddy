import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";
import { AUTO_FEATURE_LOGIN_INTROS_ENABLED } from "@/lib/login-intro-policy";

/**
 * Optional feature intros stay suppressed whenever the lasting cleanup flag is
 * off. Credits loading also defers them so a live campaign promo cannot flash
 * behind coaching/tour. A live campaign row additionally defers them so dismiss
 * does not chain another intro in the same session.
 */
export function shouldDeferOptionalLoginIntros(args: {
  creditsLoading: boolean;
  campaign: PurchaseCampaignOffer | null;
}): boolean {
  if (!AUTO_FEATURE_LOGIN_INTROS_ENABLED) return true;
  if (args.creditsLoading) return true;
  return args.campaign !== null;
}

export function shouldShowPurchaseCampaignPromo(args: {
  termsAccepted: boolean;
  requiredOnboardingComplete?: boolean;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  campaign: PurchaseCampaignOffer | null;
  seenSlug: string | null | undefined;
  optimisticSeen?: boolean;
}): boolean {
  if (!args.termsAccepted) return false;
  if (args.requiredOnboardingComplete === false) return false;
  if (args.creditsLoading) return false;
  if (args.hasOwnKey) return false;
  if (args.optimisticSeen) return false;
  if (!args.campaign || args.campaign.claimed) return false;
  if (args.seenSlug && args.seenSlug === args.campaign.slug) return false;
  return true;
}
