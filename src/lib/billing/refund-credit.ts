import { createAdminClient } from "@/lib/supabase/server";
import type { UsageCheckResult } from "@/lib/usage-tracker";

/**
 * Refund a consumed credit when the billable request failed after debit.
 *
 * Uses the service-role admin client: refund_credit is locked to service-role
 * only (migration 173) so end users cannot self-refund spent credits.
 */
export async function refundBillableCreditIfNeeded(
  userId: string,
  idempotencyKey: string | null,
  usageCheck: UsageCheckResult | null | undefined,
): Promise<number | null> {
  if (
    !usageCheck?.allowed ||
    !usageCheck.usingDefaultKey ||
    !idempotencyKey
  ) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase.rpc as Function)("refund_credit", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_reason: "AI request failed before completion",
  }) as { data: number | null; error: { message: string } | null };

  if (error) {
    console.error("[refund-credit] refund_credit error:", error.message);
    return null;
  }

  return data;
}
