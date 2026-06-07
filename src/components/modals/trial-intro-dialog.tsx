"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useCreditsStore } from "@/stores/credits-store";

interface TrialIntroDialogProps {
  open: boolean;
  onDismiss: () => void;
}

export function TrialIntroDialog({ open, onDismiss }: TrialIntroDialogProps) {
  const trialCredits = useCreditsStore((s) => s.trialCredits);
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            Welcome — you have {trialCredits} free AI calls
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm">
              <p>
                As a trial, you have{" "}
                <span className="font-semibold text-foreground">
                  {trialCredits} AI calls
                </span>{" "}
                to generate statements and run assessments. Enjoy the app — we
                appreciate any feedback!
              </p>
              <p className="text-muted-foreground">
                You can monitor your remaining calls anytime in the sidebar.
                Each generate or assessment action uses one call.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={onDismiss} className="w-full sm:w-auto">
            Got it
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
