import { createClient } from "@/lib/supabase/server";
import type {
  CreditRewardType,
  EarnRewardsSummary,
  TokenRewardRepeatMode,
  TokenRewardTrackerEntry,
} from "@/lib/billing/reward-constants";

const EMPTY_SUMMARY: EarnRewardsSummary = {
  cycleYear: new Date().getFullYear(),
  phoneVerified: false,
  totalBonusEarned: 0,
  totalBonusEarnedCycle: 0,
  referralCount: 0,
  supervisionCount: 0,
  trackerEntries: [],
  recentRewards: [],
};

function parseTrackerEntry(raw: unknown): TokenRewardTrackerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const rewardKey = row.reward_key;
  if (typeof rewardKey !== "string") return null;

  const steps = row.rule_steps;
  const ruleSteps = Array.isArray(steps)
    ? steps.filter((s): s is string => typeof s === "string")
    : [];

  return {
    reward_key: rewardKey as CreditRewardType,
    amount: typeof row.amount === "number" ? row.amount : 0,
    repeat_mode: (row.repeat_mode as TokenRewardRepeatMode) ?? "once_per_user",
    cap_per_cycle:
      typeof row.cap_per_cycle === "number" ? row.cap_per_cycle : null,
    requires_phone_verified: Boolean(row.requires_phone_verified),
    public_label:
      typeof row.public_label === "string" ? row.public_label : rewardKey,
    rule_summary:
      typeof row.rule_summary === "string" ? row.rule_summary : "",
    rule_steps: ruleSteps,
    enabled: row.enabled !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    count_this_cycle:
      typeof row.count_this_cycle === "number" ? row.count_this_cycle : 0,
    claimed_ever: Boolean(row.claimed_ever),
  };
}

export async function getEarnRewardsSummary(): Promise<EarnRewardsSummary> {
  const supabase = await createClient();

  const { data, error } = await (supabase.rpc as Function)(
    "get_user_earn_rewards_summary",
  ) as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (error) {
    console.error("[earn-rewards] summary RPC error:", error.message);
    return { ...EMPTY_SUMMARY };
  }

  if (!data || typeof data !== "object") {
    return { ...EMPTY_SUMMARY };
  }

  const trackerRaw = data.trackerEntries;
  const trackerEntries = Array.isArray(trackerRaw)
    ? trackerRaw
        .map(parseTrackerEntry)
        .filter((entry): entry is TokenRewardTrackerEntry => entry !== null)
    : [];

  const recentRaw = data.recentRewards;
  const recentRewards = Array.isArray(recentRaw) ? recentRaw : [];

  return {
    cycleYear:
      typeof data.cycleYear === "number"
        ? data.cycleYear
        : new Date().getFullYear(),
    phoneVerified: Boolean(data.phoneVerified),
    totalBonusEarned:
      typeof data.totalBonusEarned === "number" ? data.totalBonusEarned : 0,
    totalBonusEarnedCycle:
      typeof data.totalBonusEarnedCycle === "number"
        ? data.totalBonusEarnedCycle
        : 0,
    referralCount:
      typeof data.referralCount === "number" ? data.referralCount : 0,
    supervisionCount:
      typeof data.supervisionCount === "number" ? data.supervisionCount : 0,
    trackerEntries,
    recentRewards: recentRewards as EarnRewardsSummary["recentRewards"],
  };
}
