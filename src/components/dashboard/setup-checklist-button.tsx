"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListChecks } from "lucide-react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { WelcomeTourModal } from "@/components/onboarding/welcome-tour-modal";

export function SetupChecklistButton() {
  const [showChecklist, setShowChecklist] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { hasCreatedFirstTeamMember, hasConnectedSupervisor } = useOnboardingStore();

  // Wait for hydration to complete before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate completion progress
  const totalItems = 2;
  const completedItems = [hasCreatedFirstTeamMember, hasConnectedSupervisor].filter(Boolean).length;
  const isComplete = completedItems === totalItems;
  const progressPercent = (completedItems / totalItems) * 100;

  // Don't render until mounted (prevents hydration mismatch)
  // Also don't show if all items are complete
  if (!mounted || isComplete) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowChecklist(true)}
        className="gap-2"
      >
        <ListChecks className="size-4" />
        <span>Setup Guide</span>
        <span className="text-xs text-muted-foreground">
          {completedItems}/{totalItems}
        </span>
        <Progress value={progressPercent} className="w-12 h-1.5" />
      </Button>

      <WelcomeTourModal
        open={showChecklist}
        onOpenChange={setShowChecklist}
      />
    </>
  );
}
