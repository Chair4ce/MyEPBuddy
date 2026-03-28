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
  weeklyUsed: number;
  weeklyLimit: number;
  remainingThisWeek: number;
}

/**
 * Checks whether the user is within their weekly limit (if on the default key)
 * and records the action. Returns usage stats the client can display.
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
  const provider = detectProvider(modelId);

  if (!usingDefault) {
    await recordUsage(userId, action, false, modelId, provider);
    return {
      allowed: true,
      usingDefaultKey: false,
      weeklyUsed: 0,
      weeklyLimit: Infinity,
      remainingThisWeek: Infinity,
    };
  }

  const weeklyUsed = await getWeeklyDefaultKeyUsage(userId);

  if (weeklyUsed >= WEEKLY_LIMIT) {
    return {
      allowed: false,
      usingDefaultKey: true,
      weeklyUsed,
      weeklyLimit: WEEKLY_LIMIT,
      remainingThisWeek: 0,
    };
  }

  await recordUsage(userId, action, true, modelId, provider);

  const newCount = weeklyUsed + 1;
  return {
    allowed: true,
    usingDefaultKey: true,
    weeklyUsed: newCount,
    weeklyLimit: WEEKLY_LIMIT,
    remainingThisWeek: WEEKLY_LIMIT - newCount,
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

async function recordUsage(
  userId: string,
  action: BillableAction,
  usedDefaultKey: boolean,
  modelId: string,
  provider: string,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("api_usage").insert({
    user_id: userId,
    action_type: action,
    used_default_key: usedDefaultKey,
    model_id: modelId,
    provider,
  });

  if (error) {
    console.error("[usage-tracker] Failed to record usage:", error);
  }
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
