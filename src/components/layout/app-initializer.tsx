"use client";

import { useEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user-store";
import { useCreditsStore } from "@/stores/credits-store";
import { getGateProfile } from "@/lib/profile-gate";
import { UpdatePrompt } from "@/components/layout/update-prompt";
import { OnboardingFlowModal } from "@/components/modals/onboarding-flow-modal";
import { useOnboardingStep } from "@/lib/onboarding-flow";
import { useClientReady } from "@/lib/client-ready";
import { CoachingFeaturesIntroModal } from "@/components/modals/coaching-features-intro-modal";
import { PurchaseCampaignPromoModal } from "@/components/modals/purchase-campaign-promo-modal";
import { EpbPromptUpdateModal } from "@/components/modals/epb-prompt-update-modal";
import { shouldShowCoachingFeaturesIntro } from "@/lib/coaching-features-intro";
import { shouldShowPurchaseCampaignPromo } from "@/lib/billing/purchase-campaign-promo";
import { toast } from "@/components/ui/sonner";
import { InsufficientCreditsDialog } from "@/components/modals/insufficient-credits-dialog";
import { EmbeddedCheckoutDialog } from "@/components/modals/embedded-checkout-dialog";
import { usePromptRulesMode } from "@/lib/feature-flags";
import { installStaleDeploymentGuard } from "@/lib/stale-deployment-guard";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

installStaleDeploymentGuard();

interface AppInitializerProps {
  profile: Profile | null;
  subordinates: Profile[];
  managedMembers: ManagedMember[];
  epbConfig: EPBConfig | null;
  children: React.ReactNode;
}

export function AppInitializer({
  profile,
  subordinates,
  managedMembers,
  epbConfig,
  children,
}: AppInitializerProps) {
  const {
    setProfile,
    setSubordinates,
    setManagedMembers,
    setEpbConfig,
    setIsLoading,
    profile: storeProfile,
    isSigningOut,
  } = useUserStore();

  const {
    fetchCredits,
    initRealtime,
    trialIntroSeen,
    earnTokensIntroSeen,
    hasOwnKey,
    setTrialIntroSeen,
    setEarnTokensIntroSeen,
    isLoading: creditsLoading,
    earnRewardsSummary,
    trialCredits,
    purchaseCampaign,
    purchaseCampaignPromoSeenSlug,
    setPurchaseCampaignPromoSeenSlug,
    setPromoDrawerOpen,
  } = useCreditsStore();

  const hasHydrated = useRef(false);
  const creditsInitialized = useRef(false);
  const [coachingIntroSeenOptimistic, setCoachingIntroSeenOptimistic] =
    useState(false);
  const [campaignPromoSeenOptimistic, setCampaignPromoSeenOptimistic] =
    useState(false);

  useEffect(() => {
    if (!hasHydrated.current) {
      setProfile(profile);
      setSubordinates(subordinates);
      setManagedMembers(managedMembers);
      setEpbConfig(epbConfig);
      setIsLoading(false);
      if (profile?.trial_intro_seen_at) {
        setTrialIntroSeen(true);
      }
      if (profile?.earn_tokens_intro_seen_at) {
        setEarnTokensIntroSeen(true);
      }
      hasHydrated.current = true;
    } else {
      setSubordinates(subordinates);
      setManagedMembers(managedMembers);
      setEpbConfig(epbConfig);
    }
  }, [
    profile,
    subordinates,
    managedMembers,
    epbConfig,
    setProfile,
    setSubordinates,
    setManagedMembers,
    setEpbConfig,
    setIsLoading,
    setTrialIntroSeen,
    setEarnTokensIntroSeen,
  ]);

  useEffect(() => {
    if (!profile?.id || creditsInitialized.current) return;
    creditsInitialized.current = true;
    void fetchCredits().then(() => {
      initRealtime(profile.id);
    });
  }, [profile?.id, fetchCredits, initRealtime]);

  const clientReady = useClientReady();
  const gateProfile = getGateProfile(profile, storeProfile);
  const showOnboarding =
    clientReady && !isSigningOut && gateProfile !== null;

  const onboardingStep = useOnboardingStep({
    profile: gateProfile,
    creditsLoading,
    hasOwnKey,
    trialIntroSeen,
    earnTokensIntroSeen,
  });
  const onboardingComplete =
    gateProfile !== null && onboardingStep === null;

  const showCoachingIntro =
    clientReady &&
    !isSigningOut &&
    shouldShowCoachingFeaturesIntro({
      onboardingComplete,
      seenAt: gateProfile?.coaching_features_intro_seen_at,
      optimisticSeen: coachingIntroSeenOptimistic,
    });

  const showCampaignPromo =
    clientReady &&
    !isSigningOut &&
    shouldShowPurchaseCampaignPromo({
      onboardingComplete,
      blockingIntroOpen: showCoachingIntro,
      creditsLoading,
      hasOwnKey,
      campaign: purchaseCampaign,
      seenSlug: purchaseCampaignPromoSeenSlug,
      optimisticSeen: campaignPromoSeenOptimistic,
    });

  async function dismissCoachingIntro() {
    setCoachingIntroSeenOptimistic(true);
    try {
      const response = await fetch("/api/billing/accept-terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "coachingFeaturesIntro",
          coachingFeaturesIntroSeen: true,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save coaching intro dismissal");
      }
    } catch {
      setCoachingIntroSeenOptimistic(false);
      toast.error("Failed to save. Please try again.");
    }
  }

  async function dismissTrialIntro() {
    setTrialIntroSeen(true);
    await fetch("/api/billing/accept-terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trialIntroSeen: true }),
    }).catch(() => undefined);
  }

  async function dismissEarnTokensIntro() {
    setEarnTokensIntroSeen(true);
    await fetch("/api/billing/accept-terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ earnTokensIntroSeen: true }),
    }).catch(() => undefined);
  }

  async function dismissCampaignPromo() {
    if (!purchaseCampaign) return;
    const slug = purchaseCampaign.slug;
    setCampaignPromoSeenOptimistic(true);
    setPurchaseCampaignPromoSeenSlug(slug);
    try {
      const response = await fetch("/api/billing/accept-terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "purchaseCampaignPromo",
          purchaseCampaignPromoSeen: true,
          campaignSlug: slug,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save campaign promo dismissal");
      }
    } catch {
      setCampaignPromoSeenOptimistic(false);
      setPurchaseCampaignPromoSeenSlug(null);
      toast.error("Failed to save. Please try again.");
    }
  }

  function openCampaignFromPromo() {
    void dismissCampaignPromo();
    setPromoDrawerOpen(true);
  }

  const usePromptRulesModeEnabled = usePromptRulesMode();

  return (
    <>
      {showOnboarding && gateProfile && (
        <OnboardingFlowModal
          step={onboardingStep}
          profile={gateProfile}
          hasOwnKey={hasOwnKey}
          trialCredits={trialCredits}
          trackerEntries={earnRewardsSummary?.trackerEntries ?? []}
          onDismissTrialIntro={dismissTrialIntro}
          onDismissEarnTokensIntro={dismissEarnTokensIntro}
        />
      )}
      {showCoachingIntro && gateProfile && (
        <CoachingFeaturesIntroModal
          open
          onDismiss={dismissCoachingIntro}
        />
      )}
      {showCampaignPromo && purchaseCampaign && (
        <PurchaseCampaignPromoModal
          open
          campaign={purchaseCampaign}
          onDismiss={() => void dismissCampaignPromo()}
          onOpenDrawer={openCampaignFromPromo}
        />
      )}
      {onboardingComplete && !usePromptRulesModeEnabled && (
        <EpbPromptUpdateModal />
      )}
      <InsufficientCreditsDialog />
      <EmbeddedCheckoutDialog />
      <UpdatePrompt />
      {children}
    </>
  );
}
