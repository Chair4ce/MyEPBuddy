"use client";

import {
  AlertDialog,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import { ResizeContainer } from "@/components/ui/resize-container";
import { TermsStep } from "@/components/modals/onboarding/terms-step";
import { TrialIntroStep } from "@/components/modals/onboarding/trial-intro-step";
import { RankStep } from "@/components/modals/onboarding/rank-step";
import { EarnTokensIntroStep } from "@/components/modals/onboarding/earn-tokens-intro-step";
import type { OnboardingStep } from "@/lib/onboarding-flow";
import type { TokenRewardTrackerEntry } from "@/lib/billing/reward-constants";
import type { Profile } from "@/types/database";

interface OnboardingFlowModalProps {
  step: OnboardingStep | null;
  profile: Profile;
  hasOwnKey: boolean;
  trialCredits: number;
  trackerEntries: TokenRewardTrackerEntry[];
  onDismissTrialIntro: () => void;
  onDismissEarnTokensIntro: () => void;
}

export function OnboardingFlowModal({
  step,
  profile,
  hasOwnKey,
  trialCredits,
  trackerEntries,
  onDismissTrialIntro,
  onDismissEarnTokensIntro,
}: OnboardingFlowModalProps) {
  return (
    <AlertDialog open={step !== null}>
      <AlertDialogContent
        priority="high"
        size="auto"
        className="block w-fit max-w-[min(100vw-1.5rem,100%)] gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <ResizeContainer measure="both" className="min-w-0">
          {step === "terms" && (
            <div
              key="terms"
              className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
            >
              <TermsStep userId={profile.id} />
            </div>
          )}
          {step === "trial-intro" && (
            <div
              key="trial-intro"
              className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
            >
              <TrialIntroStep
                trialCredits={trialCredits}
                onDismiss={onDismissTrialIntro}
              />
            </div>
          )}
          {step === "rank" && (
            <div
              key="rank"
              className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
            >
              <RankStep />
            </div>
          )}
          {step === "earn-tokens" && (
            <div
              key="earn-tokens"
              className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
            >
              <EarnTokensIntroStep
                hasOwnKey={hasOwnKey}
                trackerEntries={trackerEntries}
                onDismiss={onDismissEarnTokensIntro}
              />
            </div>
          )}
        </ResizeContainer>
      </AlertDialogContent>
    </AlertDialog>
  );
}
