"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/stores/user-store";
import { useCreditsStore } from "@/stores/credits-store";
import { getGateProfile } from "@/lib/profile-gate";
import { UpdatePrompt } from "@/components/layout/update-prompt";
import { OnboardingFlowModal } from "@/components/modals/onboarding-flow-modal";
import { useOnboardingStep } from "@/lib/onboarding-flow";
import { EpbPromptUpdateModal } from "@/components/modals/epb-prompt-update-modal";
import { InsufficientCreditsDialog } from "@/components/modals/insufficient-credits-dialog";
import { EmbeddedCheckoutDialog } from "@/components/modals/embedded-checkout-dialog";
import { usePromptRulesMode } from "@/lib/feature-flags";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

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
  } = useUserStore();

  const {
    fetchCredits,
    initRealtime,
    trialIntroSeen,
    hasOwnKey,
    setTrialIntroSeen,
    isLoading: creditsLoading,
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
  ]);

  useEffect(() => {
    if (!profile?.id || creditsInitialized.current) return;
    creditsInitialized.current = true;
    void fetchCredits().then(() => {
      initRealtime(profile.id);
    });
  }, [profile?.id, fetchCredits, initRealtime]);

  const gateProfile = getGateProfile(profile, storeProfile);
  const onboardingStep = useOnboardingStep({
    profile: gateProfile,
    creditsLoading,
    hasOwnKey,
    trialIntroSeen,
  });
  const onboardingComplete = gateProfile !== null && onboardingStep === null;

  async function dismissTrialIntro() {
    setTrialIntroSeen(true);
    await fetch("/api/billing/accept-terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trialIntroSeen: true }),
    }).catch(() => undefined);
  }

  const usePromptRulesModeEnabled = usePromptRulesMode();

  return (
    <>
      {gateProfile && (
        <OnboardingFlowModal
          profile={gateProfile}
          creditsLoading={creditsLoading}
          hasOwnKey={hasOwnKey}
          trialIntroSeen={trialIntroSeen}
          trialCredits={trialCredits}
          onDismissTrialIntro={dismissTrialIntro}
        />
      )}
      {onboardingComplete && !usePromptRulesModeEnabled && <EpbPromptUpdateModal />}
      <InsufficientCreditsDialog />
      <EmbeddedCheckoutDialog />
      {/* Render last so the blocking update gate sits above all other modals */}
      <UpdatePrompt />
      {children}
    </>
  );
}
