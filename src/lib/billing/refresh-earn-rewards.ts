import { useCreditsStore } from "@/stores/credits-store";
import type { CreditRewardType } from "@/lib/billing/reward-constants";

function wasRewardClaimed(
  summary: ReturnType<typeof useCreditsStore.getState>["earnRewardsSummary"],
  rewardKey: CreditRewardType,
): boolean {
  return (
    summary?.trackerEntries.some(
      (entry) => entry.reward_key === rewardKey && entry.claimed_ever,
    ) ?? false
  );
}

function rewardAmount(
  summary: ReturnType<typeof useCreditsStore.getState>["earnRewardsSummary"],
  rewardKey: CreditRewardType,
): number {
  return (
    summary?.trackerEntries.find((entry) => entry.reward_key === rewardKey)
      ?.amount ?? 0
  );
}

/**
 * Refreshes balance + earn tracker after an action that may grant promotional tokens.
 * Returns newly granted reward keys (e.g. first_managed_member).
 */
export async function refreshCreditsAfterEarnAction(
  priorSummary = useCreditsStore.getState().earnRewardsSummary,
): Promise<CreditRewardType[]> {
  const store = useCreditsStore.getState();
  await Promise.all([store.fetchCredits(), store.fetchEarnRewards()]);

  const nextSummary = useCreditsStore.getState().earnRewardsSummary;
  const newlyGranted: CreditRewardType[] = [];

  for (const entry of nextSummary?.trackerEntries ?? []) {
    if (
      entry.claimed_ever &&
      !wasRewardClaimed(priorSummary, entry.reward_key)
    ) {
      newlyGranted.push(entry.reward_key);
    }
  }

  return newlyGranted;
}

export function earnRewardToastMessage(
  rewardKey: CreditRewardType,
  summary = useCreditsStore.getState().earnRewardsSummary,
): string | null {
  const amount = rewardAmount(summary, rewardKey);
  if (amount <= 0) return null;

  switch (rewardKey) {
    case "first_managed_member":
      return `You earned ${amount} tokens for adding your first managed team member!`;
    default:
      return `You earned ${amount} promotional tokens!`;
  }
}
