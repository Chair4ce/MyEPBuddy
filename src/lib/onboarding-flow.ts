import { useRankModalDismissed } from "@/lib/rank-modal-storage";
import type { Profile } from "@/types/database";

export type OnboardingStep = "terms" | "trial-intro" | "rank";

export function resolveOnboardingStep({
  profile,
  creditsLoading,
  hasOwnKey,
  trialIntroSeen,
  rankDismissed,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
  rankDismissed: boolean;
}): OnboardingStep | null {
  if (!profile) return null;

  if (!profile.terms_accepted_at) {
    return "terms";
  }

  const trialIntroDismissed =
    trialIntroSeen || Boolean(profile.trial_intro_seen_at);

  if (!creditsLoading && !hasOwnKey && !trialIntroDismissed) {
    return "trial-intro";
  }

  if (!profile.rank && !rankDismissed) {
    return "rank";
  }

  return null;
}

export function useOnboardingStep({
  profile,
  creditsLoading,
  hasOwnKey,
  trialIntroSeen,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
}): OnboardingStep | null {
  const rankDismissed = useRankModalDismissed(profile?.id);
  return resolveOnboardingStep({
    profile,
    creditsLoading,
    hasOwnKey,
    trialIntroSeen,
    rankDismissed,
  });
}
