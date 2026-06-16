"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/stores/user-store";
import { useCreditsStore } from "@/stores/credits-store";
import { getGateProfile } from "@/lib/profile-gate";
import { UpdatePrompt } from "@/components/layout/update-prompt";
import { OnboardingFlowModal } from "@/components/modals/onboarding-flow-modal";
import { useOnboardingStep } from "@/lib/onboarding-flow";
import { useClientReady } from "@/lib/client-ready";
import { EpbPromptUpdateModal } from "@/components/modals/epb-prompt-update-modal";
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
  } = useCreditsStore();

  const hasHydrated = useRef(false);
  const creditsInitialized = useRef(false);

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
