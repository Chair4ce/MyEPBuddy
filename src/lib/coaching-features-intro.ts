export function shouldShowCoachingFeaturesIntro(args: {
  onboardingComplete: boolean;
  seenAt: string | null | undefined;
  optimisticSeen?: boolean;
}): boolean {
  if (!args.onboardingComplete) return false;
  if (args.optimisticSeen) return false;
  if (args.seenAt) return false;
  return true;
}
