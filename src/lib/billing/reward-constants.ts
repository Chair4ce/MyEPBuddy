/** Fallback mirrors of DB token_reward_config (used when catalog cannot load). */
export const REFERRAL_REFERRER_TOKENS = 15;
export const REFERRAL_REFEREE_TOKENS = 10;
export const SUPERVISION_PARTY_TOKENS = 8;
export const FIRST_MANAGED_MEMBER_TOKENS = 10;

export const REFERRAL_EARN_CAP_PER_CYCLE = 10;
export const SUPERVISION_EARN_CAP_PER_CYCLE = 15;
export const MAX_BONUS_TOKENS_PER_CYCLE = 200;

export const REWARD_PAYOUT_DELAY_HOURS = 72;

export type CreditRewardType =
  | "referral_referrer"
  | "referral_referee"
  | "supervision_requester"
  | "supervision_accepter"
  | "first_managed_member";

export type TokenRewardRepeatMode =
  | "once_per_user"
  | "once_per_source"
  | "repeatable_per_cycle";

export interface TokenRewardTrackerEntry {
  reward_key: CreditRewardType;
  amount: number;
  repeat_mode: TokenRewardRepeatMode;
  cap_per_cycle: number | null;
  requires_phone_verified: boolean;
  public_label: string;
  rule_summary: string;
  rule_steps: string[];
  enabled: boolean;
  sort_order: number;
  count_this_cycle: number;
  claimed_ever: boolean;
}

export interface EarnRewardRow {
  id: string;
  reward_type: CreditRewardType;
  amount: number;
  description: string | null;
  cycle_year: number;
  created_at: string;
}

export interface EarnRewardsSummary {
  cycleYear: number;
  phoneVerified: boolean;
  totalBonusEarned: number;
  totalBonusEarnedCycle: number;
  referralCount: number;
  supervisionCount: number;
  trackerEntries: TokenRewardTrackerEntry[];
  recentRewards: EarnRewardRow[];
}

export function rewardTypeLabel(type: CreditRewardType): string {
  switch (type) {
    case "referral_referrer":
      return "Referral — you invited someone";
    case "referral_referee":
      return "Referral — welcome bonus";
    case "supervision_requester":
      return "Team link — request accepted";
    case "supervision_accepter":
      return "Team link — you accepted";
    case "first_managed_member":
      return "First managed team member";
    default:
      return type;
  }
}

export function trackerEntryProgress(entry: TokenRewardTrackerEntry): {
  count: number;
  cap: number | null;
  percent: number;
  complete: boolean;
} {
  if (entry.repeat_mode === "once_per_user" || entry.repeat_mode === "once_per_source") {
    return {
      count: entry.claimed_ever ? 1 : 0,
      cap: 1,
      percent: entry.claimed_ever ? 100 : 0,
      complete: entry.claimed_ever,
    };
  }

  const cap = entry.cap_per_cycle ?? 0;
  const count = entry.count_this_cycle;
  return {
    count,
    cap: cap > 0 ? cap : null,
    percent: cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0,
    complete: cap > 0 && count >= cap,
  };
}

export const EARN_REWARD_RULES = {
  headline:
    "Earn free tokens by growing your team — referrals, supervision links, and one-time setup bonuses.",
  phoneRequirement:
    "Referrals and supervision bonuses require a unique verified phone number on both accounts. One-time setup bonuses (like your first managed member) do not.",
  global: {
    maxBonusPerCycle: MAX_BONUS_TOKENS_PER_CYCLE,
    payoutDelayHours: REWARD_PAYOUT_DELAY_HOURS,
    byokNote:
      "Users on their own API key do not see or earn promotional tokens.",
  },
} as const;

/** Fallback catalog when earn-rewards API has not loaded yet. */
export const FALLBACK_TRACKER_ENTRIES: TokenRewardTrackerEntry[] = [
  {
    reward_key: "first_managed_member",
    amount: FIRST_MANAGED_MEMBER_TOKENS,
    repeat_mode: "once_per_user",
    cap_per_cycle: null,
    requires_phone_verified: false,
    public_label: "First managed team member",
    rule_summary:
      "One-time bonus when you add your first managed team member to your roster.",
    rule_steps: [],
    enabled: true,
    sort_order: 10,
    count_this_cycle: 0,
    claimed_ever: false,
  },
  {
    reward_key: "referral_referrer",
    amount: REFERRAL_REFERRER_TOKENS,
    repeat_mode: "repeatable_per_cycle",
    cap_per_cycle: REFERRAL_EARN_CAP_PER_CYCLE,
    requires_phone_verified: true,
    public_label: "Refer a teammate",
    rule_summary: "Earn when someone signs up on your referral link and qualifies.",
    rule_steps: [],
    enabled: false,
    sort_order: 20,
    count_this_cycle: 0,
    claimed_ever: false,
  },
  {
    reward_key: "supervision_requester",
    amount: SUPERVISION_PARTY_TOKENS,
    repeat_mode: "repeatable_per_cycle",
    cap_per_cycle: SUPERVISION_EARN_CAP_PER_CYCLE,
    requires_phone_verified: true,
    public_label: "Supervision request accepted",
    rule_summary: "Earn when a supervise / be-supervised request is accepted.",
    rule_steps: [],
    enabled: false,
    sort_order: 30,
    count_this_cycle: 0,
    claimed_ever: false,
  },
];
