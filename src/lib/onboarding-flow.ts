import { useRankModalDismissed } from "@/lib/rank-modal-storage";
import { AUTO_FEATURE_LOGIN_INTROS_ENABLED } from "@/lib/login-intro-policy";
import type { Profile } from "@/types/database";

export type OnboardingStep = "terms" | "trial-intro" | "rank" | "earn-tokens";

export function resolveOnboardingStep({
  profile,
  creditsLoading,
  hasOwnKey,
  trialIntroSeen,
  earnTokensIntroSeen,
  rankDismissed,
  deferOptionalIntros = false,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
  earnTokensIntroSeen: boolean;
  rankDismissed: boolean;
  deferOptionalIntros?: boolean;
}): OnboardingStep | null {
  if (!profile) return null;

  if (!profile.terms_accepted_at) {
    return "terms";
  }

  if (!profile.rank && !rankDismissed) {
    return "rank";
  }

  if (!AUTO_FEATURE_LOGIN_INTROS_ENABLED || deferOptionalIntros) {
    return null;
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
  deferOptionalIntros = false,
}: {
  profile: Profile | null;
  creditsLoading: boolean;
  hasOwnKey: boolean;
  trialIntroSeen: boolean;
  earnTokensIntroSeen: boolean;
  deferOptionalIntros?: boolean;
}): OnboardingStep | null {
  const rankDismissed = useRankModalDismissed(profile?.id);
  return resolveOnboardingStep({
    profile,
    creditsLoading,
    hasOwnKey,
    trialIntroSeen,
    earnTokensIntroSeen,
    rankDismissed,
    deferOptionalIntros,
  });
}
