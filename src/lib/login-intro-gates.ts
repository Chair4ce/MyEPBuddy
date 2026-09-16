import { shouldShowCoachingFeaturesIntro } from "@/lib/coaching-features-intro";
import {
  shouldDeferOptionalLoginIntros,
  shouldShowPurchaseCampaignPromo,
} from "@/lib/billing/purchase-campaign-promo";
import { AUTO_FEATURE_LOGIN_INTROS_ENABLED } from "@/lib/login-intro-policy";
import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";
import type { OnboardingStep } from "@/lib/onboarding-flow";

export function resolveLoginIntroGates(args: {
  clientReady: boolean;
  isSigningOut: boolean;
  termsAccepted: boolean;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  campaign: PurchaseCampaignOffer | null;
  campaignSeenSlug: string | null | undefined;
  campaignOptimisticSeen?: boolean;
  onboardingStep: OnboardingStep | null;
  coachingSeenAt: string | null | undefined;
  coachingOptimisticSeen?: boolean;
  promptRulesModeEnabled: boolean;
}): {
  deferOptionalIntros: boolean;
  showCampaignPromo: boolean;
  showCoachingIntro: boolean;
  showEpbPromptUpdate: boolean;
  runEpbPromptRevisionCheck: boolean;
  showWelcomeTour: boolean;
} {
  const deferOptionalIntros = shouldDeferOptionalLoginIntros({
    creditsLoading: args.creditsLoading,
    campaign: args.campaign,
  });

  const sessionReady = args.clientReady && !args.isSigningOut;
  const requiredOnboardingComplete =
    args.termsAccepted && args.onboardingStep === null;

  const showCampaignPromo =
    sessionReady &&
    shouldShowPurchaseCampaignPromo({
      termsAccepted: args.termsAccepted,
      requiredOnboardingComplete,
      creditsLoading: args.creditsLoading,
      hasOwnKey: args.hasOwnKey,
      campaign: args.campaign,
      seenSlug: args.campaignSeenSlug,
      optimisticSeen: args.campaignOptimisticSeen,
    });

  const showCoachingIntro =
    sessionReady &&
    shouldShowCoachingFeaturesIntro({
      onboardingComplete: requiredOnboardingComplete,
      seenAt: args.coachingSeenAt,
      optimisticSeen: args.coachingOptimisticSeen,
      deferOptionalIntros,
    });

  const showEpbPromptUpdate =
    sessionReady &&
    requiredOnboardingComplete &&
    !args.promptRulesModeEnabled &&
    AUTO_FEATURE_LOGIN_INTROS_ENABLED &&
    !deferOptionalIntros;

  const runEpbPromptRevisionCheck =
    sessionReady && requiredOnboardingComplete && !args.promptRulesModeEnabled;

  const showWelcomeTour =
    sessionReady &&
    AUTO_FEATURE_LOGIN_INTROS_ENABLED &&
    !deferOptionalIntros;

  return {
    deferOptionalIntros,
    showCampaignPromo,
    showCoachingIntro,
    showEpbPromptUpdate,
    runEpbPromptRevisionCheck,
    showWelcomeTour,
  };
}
