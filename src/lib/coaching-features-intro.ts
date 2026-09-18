import { AUTO_FEATURE_LOGIN_INTROS_ENABLED } from "@/lib/login-intro-policy";

export function shouldShowCoachingFeaturesIntro(args: {
  onboardingComplete: boolean;
  seenAt: string | null | undefined;
  optimisticSeen?: boolean;
  deferOptionalIntros?: boolean;
}): boolean {
  if (!AUTO_FEATURE_LOGIN_INTROS_ENABLED) return false;
  if (args.deferOptionalIntros) return false;
  if (!args.onboardingComplete) return false;
  if (args.optimisticSeen) return false;
  if (args.seenAt) return false;
  return true;
}
