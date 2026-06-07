"use client";

import {
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface TrialIntroStepProps {
  trialCredits: number;
  onDismiss: () => void;
}

export function TrialIntroStep({ trialCredits, onDismiss }: TrialIntroStepProps) {
  return (
    <div className="box-border w-[min(100vw-1.5rem,28rem)] max-w-full p-6 md:p-8">
      <AlertDialogHeader className="text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary shrink-0" aria-hidden />
        </div>
        <AlertDialogTitle className="text-center text-base md:text-lg">
          Welcome — you have {trialCredits} free AI calls
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-3 pt-1 text-sm text-center">
            <p>
              As a trial, you have{" "}
              <span className="font-semibold text-foreground">
                {trialCredits} AI calls
              </span>{" "}
              to generate statements and run assessments. Enjoy the app — we
              appreciate any feedback!
            </p>
            <p className="text-muted-foreground">
              You can monitor your remaining calls anytime in the sidebar. Each
              generate or assessment action uses one call.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="mt-4 md:justify-center">
        <Button
          onClick={onDismiss}
          className="w-full md:w-auto md:min-w-[160px]"
        >
          Got it
        </Button>
      </AlertDialogFooter>
    </div>
  );
}
