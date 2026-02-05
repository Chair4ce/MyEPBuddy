"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TourOverlay } from "./tour-overlay";
import { WelcomeTourModal } from "./welcome-tour-modal";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useUserStore } from "@/stores/user-store";

export function TourProvider() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { profile, subordinates, managedMembers, isLoading } = useUserStore();
  const {
    hasSeenWelcome,
    activeTour,
    setHasSeenWelcome,
    hasCreatedFirstTeamMember,
    hasConnectedSupervisor,
    setHasCreatedFirstTeamMember,
    setHasConnectedSupervisor,
  } = useOnboardingStore();

  // Wait for hydration to complete
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if user has team members (either subordinates or managed members)
  const hasTeamMembers = subordinates.length > 0 || managedMembers.length > 0;
  
  // Check if user has any real connections (supervises someone or has a supervisor)
  const hasRealConnections = subordinates.length > 0 || (profile?.supervisor_id !== null && profile?.supervisor_id !== undefined);

  // Update team member status when it changes
  useEffect(() => {
    if (!isLoading && profile && mounted) {
      // Track if they've added a managed member
      if (managedMembers.length > 0 && !hasCreatedFirstTeamMember) {
        setHasCreatedFirstTeamMember(true);
      }
      // Track if they've connected to an existing member (either as supervisor or subordinate)
      if (hasRealConnections && !hasConnectedSupervisor) {
        setHasConnectedSupervisor(true);
      }
    }
  }, [managedMembers.length, hasRealConnections, hasCreatedFirstTeamMember, hasConnectedSupervisor, isLoading, profile, mounted, setHasCreatedFirstTeamMember, setHasConnectedSupervisor]);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted) {
    return null;
  }

  // Determine if we should show the welcome modal
  // Show if: user is logged in, on dashboard, hasn't seen welcome, and no active tour
  const shouldShowWelcome =
    !isLoading &&
    profile &&
    pathname === "/dashboard" &&
    !hasSeenWelcome &&
    !activeTour &&
    !hasTeamMembers; // Only show if they don't have team members yet

  return (
    <>
      {/* Tour overlay for active tours */}
      <TourOverlay />

      {/* Welcome modal for first-time users */}
      <WelcomeTourModal
        open={shouldShowWelcome}
        onOpenChange={(open) => {
          if (!open) {
            setHasSeenWelcome(true);
          }
        }}
      />
    </>
  );
}
