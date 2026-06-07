"use client";

import { useEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user-store";
import { useCreditsStore } from "@/stores/credits-store";
import { TermsAgreementDialog } from "@/components/layout/terms-agreement-dialog";
import { UpdatePrompt } from "@/components/layout/update-prompt";
import { RankCompletionModal } from "@/components/modals/rank-completion-modal";
import { EpbPromptUpdateModal } from "@/components/modals/epb-prompt-update-modal";
import { InsufficientCreditsDialog } from "@/components/modals/insufficient-credits-dialog";
import { EmbeddedCheckoutDialog } from "@/components/modals/embedded-checkout-dialog";
import { TrialIntroDialog } from "@/components/modals/trial-intro-dialog";
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
  } = useCreditsStore();

  const hasHydrated = useRef(false);
  const creditsInitialized = useRef(false);
  const [showTrialIntro, setShowTrialIntro] = useState(false);

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

  useEffect(() => {
    if (creditsLoading || hasOwnKey || trialIntroSeen) {
      setShowTrialIntro(false);
      return;
    }
    setShowTrialIntro(true);
  }, [trialIntroSeen, hasOwnKey, creditsLoading]);

  const currentProfile = storeProfile ?? profile;
  const { termsAcceptedThisSession } = useUserStore();
  const showTermsDialog = currentProfile && !termsAcceptedThisSession;

  async function dismissTrialIntro() {
    setShowTrialIntro(false);
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
      {showTermsDialog && currentProfile && (
        <TermsAgreementDialog open={true} userId={currentProfile.id} />
      )}
      {!showTermsDialog && <RankCompletionModal />}
      {!showTermsDialog && !usePromptRulesModeEnabled && <EpbPromptUpdateModal />}
      {!showTermsDialog && !hasOwnKey && (
        <TrialIntroDialog
          open={showTrialIntro && !trialIntroSeen}
          onDismiss={dismissTrialIntro}
        />
      )}
      <InsufficientCreditsDialog />
      <EmbeddedCheckoutDialog />
      {/* Render last so the blocking update gate sits above all other modals */}
      <UpdatePrompt />
      {children}
    </>
  );
}
