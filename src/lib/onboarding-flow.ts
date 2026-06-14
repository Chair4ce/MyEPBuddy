import { useRankModalDismissed } from "@/lib/rank-modal-storage";
import type { Profile } from "@/types/database";

export type OnboardingStep = "terms" | "trial-intro" | "rank" | "earn-tokens";

export function resolveOnboardingStep({
  profile,
  creditsLoading,
  hasOwnKey,
  trialIntroSeen,
  earnTokensIntroSeen,
  rankDismissed,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
  earnTokensIntroSeen: boolean;
  rankDismissed: boolean;
}): OnboardingStep | null {
  if (!profile) return null;

  if (!profile.terms_accepted_at) {
    return "terms";
  }

  if (!profile.rank && !rankDismissed) {
    return "rank";
  }

  const trialIntroDismissed =
    trialIntroSeen || Boolean(profile.trial_intro_seen_at);

  if (!creditsLoading && !hasOwnKey && !trialIntroDismissed) {
    return "trial-intro";
  }

  const earnIntroDismissed =
    earnTokensIntroSeen || Boolean(profile.earn_tokens_intro_seen_at);

  if (!earnIntroDismissed) {
    return "earn-tokens";
  }

  return null;
}

export function useOnboardingStep({
  profile,
  creditsLoading,
  hasOwnKey,
  trialIntroSeen,
  earnTokensIntroSeen,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
  earnTokensIntroSeen: boolean;
}): OnboardingStep | null {
  const rankDismissed = useRankModalDismissed(profile?.id);
  return resolveOnboardingStep({
    profile,
    creditsLoading,
    hasOwnKey,
    trialIntroSeen,
    earnTokensIntroSeen,
    rankDismissed,
  });
}
