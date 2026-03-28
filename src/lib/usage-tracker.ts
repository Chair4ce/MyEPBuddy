/**
 * API Usage Tracker
 *
 * Enforces per-user weekly limits when the app's default API key is used.
 * Users with their own API key for the relevant provider are unlimited.
 *
 * One "billable action" = one user-initiated click (generate, revise, assess, etc.).
 * Internal sub-calls (QC passes, per-accomplishment loops, style signatures)
 * are NOT counted separately.
 */

import { createClient } from "@/lib/supabase/server";
import { isUsingDefaultKey, detectProvider } from "@/lib/llm-provider";
import type { DecryptedApiKeys } from "@/app/actions/api-keys";

const WEEKLY_LIMIT = 20;

/**
 * Cheapest model forced for users on the app's default API key.
 * Keeps per-request cost minimal (~$0.001 vs ~$0.01+ for premium models).
 */
export const DEFAULT_KEY_MODEL = "gemini-2.0-flash";

export type BillableAction =
  | "generate"
  | "revise_selection"
  | "generate_war"
  | "generate_award"
  | "generate_decoration"
  | "generate_slot_statement"
  | "assess_epb"
  | "assess_accomplishment"
  | "assess_accomplishment_preview"
  | "parse_bulk_statements"
  | "adapt_sentence"
  | "synonyms"
  | "combine"
  | "combine_statements"
  | "convert_sentences"
  | "feedback_apply";

export interface UsageCheckResult {
  allowed: boolean;
  usingDefaultKey: boolean;
  effectiveModel: string;
  weeklyUsed: number;
  weeklyLimit: number;
  remainingThisWeek: number;
  rateLimited?: boolean;
}

/**
 * Checks whether the user is within their weekly limit (if on the default key)
 * and records the action atomically. Returns usage stats the client can display.
 *
 * Uses a Postgres RPC that serializes concurrent requests via row-level locks
 * to prevent race-condition bypasses of the weekly limit.
 *
 * Call this ONCE at the top of each API route, before the LLM call.
 * If `allowed` is false, return a 429 immediately.
 */
export async function checkAndTrackUsage(
  userId: string,
  action: BillableAction,
  modelId: string,
  userKeys: Partial<DecryptedApiKeys> | null,
): Promise<UsageCheckResult> {
  const usingDefault = isUsingDefaultKey(modelId, userKeys);
  const effectiveModel = usingDefault ? DEFAULT_KEY_MODEL : modelId;
  const provider = detectProvider(effectiveModel);
  const supabase = await createClient();

  const { data: countAfter, error } = await (supabase.rpc as Function)(
    "check_and_record_usage",
    {
      p_user_id: userId,
      p_action_type: action,
      p_used_default_key: usingDefault,
      p_model_id: effectiveModel,
      p_provider: provider,
      p_weekly_limit: WEEKLY_LIMIT,
    },
  ) as { data: number | null; error: { message: string } | null };

  if (error) {
    console.error("[usage-tracker] RPC error:", error.message);
    return {
      allowed: !usingDefault,
      usingDefaultKey: usingDefault,
      effectiveModel,
      weeklyUsed: usingDefault ? WEEKLY_LIMIT : 0,
      weeklyLimit: WEEKLY_LIMIT,
      remainingThisWeek: 0,
    };
  }

  const countResult = countAfter ?? 0;

  // -1 = burst rate limit hit (too many actions in 60 seconds)
  if (countResult === -1) {
    return {
      allowed: false,
      usingDefaultKey: usingDefault,
      effectiveModel,
      weeklyUsed: 0,
      weeklyLimit: WEEKLY_LIMIT,
      remainingThisWeek: 0,
      rateLimited: true,
    };
  }

  if (!usingDefault) {
    return {
      allowed: true,
      usingDefaultKey: false,
      effectiveModel,
      weeklyUsed: 0,
      weeklyLimit: Infinity,
      remainingThisWeek: Infinity,
    };
  }

  if (countResult > WEEKLY_LIMIT) {
    return {
      allowed: false,
      usingDefaultKey: true,
      effectiveModel,
      weeklyUsed: countResult,
      weeklyLimit: WEEKLY_LIMIT,
      remainingThisWeek: 0,
    };
  }

  return {
    allowed: true,
    usingDefaultKey: true,
    effectiveModel,
    weeklyUsed: countResult,
    weeklyLimit: WEEKLY_LIMIT,
    remainingThisWeek: WEEKLY_LIMIT - countResult,
  };
}

/**
 * Returns current usage stats without recording anything.
 * Used by the GET /api/usage endpoint.
 */
export async function getUsageStats(userId: string): Promise<{
  weeklyUsed: number;
  weeklyLimit: number;
  remainingThisWeek: number;
  resetDate: string;
}> {
  const weeklyUsed = await getWeeklyDefaultKeyUsage(userId);
  const resetDate = getNextWeekResetDate();

  return {
    weeklyUsed,
    weeklyLimit: WEEKLY_LIMIT,
    remainingThisWeek: Math.max(0, WEEKLY_LIMIT - weeklyUsed),
    resetDate: resetDate.toISOString(),
  };
}

async function getWeeklyDefaultKeyUsage(userId: string): Promise<number> {
  const supabase = await createClient();
  const weekStart = getWeekStartDate();

  const { count, error } = await supabase
    .from("api_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("used_default_key", true)
    .gte("created_at", weekStart.toISOString());

  if (error) {
    console.error("[usage-tracker] Failed to query usage:", error);
    return 0;
  }

  return count ?? 0;
}

/** Monday 00:00 UTC of the current week */
function getWeekStartDate(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Next Monday 00:00 UTC */
function getNextWeekResetDate(): Date {
  const weekStart = getWeekStartDate();
  weekStart.setUTCDate(weekStart.getUTCDate() + 7);
  return weekStart;
}
