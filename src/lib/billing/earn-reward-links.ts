import type { CreditRewardType } from "@/lib/billing/reward-constants";

export interface EarnRewardActionLink {
  href: string;
  /** Accessible label for the link target */
  ariaLabel: string;
}

/** Deep links for completing earn-token actions (keep in sync with team/settings routes). */
export const EARN_REWARD_ACTION_LINKS: Record<
  CreditRewardType,
  EarnRewardActionLink | null
> = {
  first_managed_member: {
    href: "/team?action=add-member",
    ariaLabel: "Go to My Team to add a managed member",
  },
  referral_referrer: {
    href: "/settings/billing#earn-referrals",
    ariaLabel: "Go to referral sharing on AI Tokens settings",
  },
  referral_referee: {
    href: "/settings/billing#earn-referrals",
    ariaLabel: "Learn how the referral welcome bonus works",
  },
  supervision_requester: {
    href: "/team?action=request-supervision&intent=supervise",
    ariaLabel: "Go to My Team to send a supervision request",
  },
  supervision_accepter: {
    href: "/team?action=request-supervision&intent=be_supervised",
    ariaLabel: "Go to My Team to request a supervisor",
  },
};

export function getEarnRewardActionLink(
  rewardKey: CreditRewardType,
): EarnRewardActionLink | null {
  return EARN_REWARD_ACTION_LINKS[rewardKey] ?? null;
}
