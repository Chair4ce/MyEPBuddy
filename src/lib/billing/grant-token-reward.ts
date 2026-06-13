import { createAdminClient } from "@/lib/supabase/server";
import type { CreditRewardType } from "@/lib/billing/reward-constants";

export interface GrantTokenRewardResult {
  granted: number;
}

/**
 * Server-only entry point for promotional token grants.
 * Wraps the central `grant_token_reward` RPC (requires service-role / no user JWT).
 */
export async function grantTokenReward(params: {
  userId: string;
  rewardType: CreditRewardType;
  sourceId: string;
  context?: Record<string, unknown>;
}): Promise<GrantTokenRewardResult> {
  const admin = createAdminClient();

  const { data, error } = await (admin.rpc as Function)("grant_token_reward", {
    p_user_id: params.userId,
    p_reward_type: params.rewardType,
    p_source_id: params.sourceId,
    p_context: params.context ?? {},
  }) as { data: number | null; error: { message: string } | null };

  if (error) {
    console.error("[grantTokenReward]", params.rewardType, error.message);
    return { granted: 0 };
  }

  return { granted: data ?? 0 };
}
