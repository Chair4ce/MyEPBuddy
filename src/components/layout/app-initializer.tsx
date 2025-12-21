"use client";

import { useEffect } from "react";
import { useUserStore } from "@/stores/user-store";
import { TermsAgreementDialog } from "@/components/layout/terms-agreement-dialog";
import { UpdatePrompt } from "@/components/layout/update-prompt";
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

  useEffect(() => {
    setProfile(profile);
    setSubordinates(subordinates);
    setManagedMembers(managedMembers);
    setEpbConfig(epbConfig);
    setIsLoading(false);
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
      {children}
    </>
  );
}

