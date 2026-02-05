"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/stores/user-store";
import { TermsAgreementDialog } from "@/components/layout/terms-agreement-dialog";
import { UpdatePrompt } from "@/components/layout/update-prompt";
import { RankCompletionModal } from "@/components/modals/rank-completion-modal";
// TODO: Re-enable tutorial feature when ready
// import { TourProvider } from "@/components/onboarding";
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
    profile: storeProfile 
  } = useUserStore();
  
  // Track if we've done initial hydration
  const hasHydrated = useRef(false);

  useEffect(() => {
    // Only set server data on initial hydration
    // After that, prefer client-side updates in the store
    if (!hasHydrated.current) {
      setProfile(profile);
      setSubordinates(subordinates);
      setManagedMembers(managedMembers);
      setEpbConfig(epbConfig);
      setIsLoading(false);
      hasHydrated.current = true;
    } else {
      // On subsequent navigations, only update subordinates/managed members
      // since those might have changed on the server (new requests, etc.)
      // but keep the profile from the store (client-side updates)
      setSubordinates(subordinates);
      setManagedMembers(managedMembers);
      setEpbConfig(epbConfig);
    }
  }, [profile, subordinates, managedMembers, epbConfig, setProfile, setSubordinates, setManagedMembers, setEpbConfig, setIsLoading]);

  // Use store profile for reactivity (updates when terms are accepted)
  const currentProfile = storeProfile ?? profile;
  const showTermsDialog = currentProfile && !currentProfile.terms_accepted_at;

  return (
    <>
      <UpdatePrompt />
      {showTermsDialog && currentProfile && (
        <TermsAgreementDialog
          open={true}
          userId={currentProfile.id}
        />
      )}
      {/* Show rank completion modal after terms are accepted */}
      {!showTermsDialog && <RankCompletionModal />}
      {/* TODO: Re-enable tutorial feature when ready */}
      {/* {!showTermsDialog && <TourProvider />} */}
      {children}
    </>
  );
}

