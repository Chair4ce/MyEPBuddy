"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useOnboardingStore } from "@/stores/onboarding-store";

interface WelcomeTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelcomeTourModal({ open, onOpenChange }: WelcomeTourModalProps) {
  const router = useRouter();
  const { 
    startTour, 
    setHasSeenWelcome,
    hasCreatedFirstTeamMember,
    hasConnectedSupervisor,
  } = useOnboardingStore();

  const handleStartSubordinateTour = () => {
    onOpenChange(false);
    router.push("/team");
    setTimeout(() => {
      startTour("add-subordinate");
    }, 500);
  };

  const handleStartSupervisorTour = () => {
    onOpenChange(false);
    router.push("/team");
    setTimeout(() => {
      startTour("connect-supervisor");
    }, 500);
  };

  const handleSkip = () => {
    setHasSeenWelcome(true);
    onOpenChange(false);
  };

  // Check if all items are complete
  const allComplete = hasCreatedFirstTeamMember && hasConnectedSupervisor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Let&apos;s get you set up</DialogTitle>
          <DialogDescription className="sr-only">
            Complete these steps to get started with myEPBuddy
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          <div
            role="button"
            tabIndex={hasCreatedFirstTeamMember ? -1 : 0}
            onClick={() => !hasCreatedFirstTeamMember && handleStartSubordinateTour()}
            onKeyDown={(e) => !hasCreatedFirstTeamMember && e.key === "Enter" && handleStartSubordinateTour()}
            className={`w-full flex items-center gap-2 py-1.5 text-left transition-all rounded ${
              hasCreatedFirstTeamMember
                ? "opacity-60 cursor-default"
                : "hover:text-primary cursor-pointer"
            }`}
          >
            <div className={`size-4 rounded-sm border flex items-center justify-center shrink-0 ${
              hasCreatedFirstTeamMember 
                ? "bg-primary border-primary" 
                : "border-input"
            }`}>
              {hasCreatedFirstTeamMember && <Check className="size-3 text-primary-foreground" />}
            </div>
            <span className={`text-sm ${hasCreatedFirstTeamMember ? "line-through" : ""}`}>
              Add a managed subordinate
            </span>
          </div>

          <div
            role="button"
            tabIndex={hasConnectedSupervisor ? -1 : 0}
            onClick={() => !hasConnectedSupervisor && handleStartSupervisorTour()}
            onKeyDown={(e) => !hasConnectedSupervisor && e.key === "Enter" && handleStartSupervisorTour()}
            className={`w-full flex items-center gap-2 py-1.5 text-left transition-all rounded ${
              hasConnectedSupervisor
                ? "opacity-60 cursor-default"
                : "hover:text-primary cursor-pointer"
            }`}
          >
            <div className={`size-4 rounded-sm border flex items-center justify-center shrink-0 ${
              hasConnectedSupervisor 
                ? "bg-primary border-primary" 
                : "border-input"
            }`}>
              {hasConnectedSupervisor && <Check className="size-3 text-primary-foreground" />}
            </div>
            <span className={`text-sm ${hasConnectedSupervisor ? "line-through" : ""}`}>
              Connect to existing member
            </span>
          </div>
        </div>

        <DialogFooter>
          {allComplete ? (
            <Button onClick={handleSkip} className="w-full">
              All done
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleSkip} className="w-full">
              Shut up and let me cook
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
