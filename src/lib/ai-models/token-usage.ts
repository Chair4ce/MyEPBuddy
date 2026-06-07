/**
 * LLM Token Usage Capture
 *
 * Records per-call token consumption (input/output/cached/reasoning) and a
 * snapshot of the estimated USD cost, so BYOK users can project spend for the
 * models they use.
 *
 * Capture happens transparently via AI SDK middleware wrapped around the model
 * in {@link getModelProvider}. This means every generateText call — including
 * multi-call routes (per-MPA loops, QC passes) — is captured without per-route
 * result handling.
 *
 * Inserts use the service-role admin client (RLS bypassed). Recording is
 * fire-and-forget: a logging failure must never break a user's generation.
 */

import {
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from "ai";
import { createAdminClient } from "@/lib/supabase/server";
import { getCachedCatalogRows } from "@/lib/ai-models/catalog-cache";
import type { CatalogModelRow } from "@/lib/ai-models/types";

export interface TokenTrackingContext {
  userId: string;
  action: string;
  usingDefaultKey: boolean;
}

interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
}

/**
 * Normalizes the nested AI SDK v3 usage shape into flat token counts.
 * Every field is optional at the provider level, so we coerce to integers.
 */
function normalizeUsage(usage: unknown): NormalizedUsage {
  const u = (usage ?? {}) as {
    inputTokens?: { total?: number; noCache?: number; cacheRead?: number };
    outputTokens?: { total?: number; reasoning?: number };
  };

  const inputTotal = Math.max(0, Math.round(u.inputTokens?.total ?? 0));
  const cacheRead = Math.max(0, Math.round(u.inputTokens?.cacheRead ?? 0));
  const outputTotal = Math.max(0, Math.round(u.outputTokens?.total ?? 0));
  const reasoning = Math.max(0, Math.round(u.outputTokens?.reasoning ?? 0));

  return {
    inputTokens: inputTotal,
    outputTokens: outputTotal,
    cachedInputTokens: Math.min(cacheRead, inputTotal),
    reasoningTokens: reasoning,
  };
}

/**
 * Estimates the USD cost of a single call from catalog pricing.
 * Returns null when no pricing is configured for the model.
 *
 * Cached input tokens are billed at the cached rate (or the standard input
 * rate when no cached rate is set); the remaining (non-cached) input tokens
 * use the standard input rate.
 */
export function estimateCostUsd(
  usage: NormalizedUsage,
  pricing: Pick<
    CatalogModelRow,
    | "input_price_per_mtok"
    | "output_price_per_mtok"
    | "cached_input_price_per_mtok"
  > | null,
): number | null {
  if (!pricing) return null;

  const inputPrice = pricing.input_price_per_mtok;
  const outputPrice = pricing.output_price_per_mtok;
  if (inputPrice == null && outputPrice == null) return null;

  const cachedPrice = pricing.cached_input_price_per_mtok ?? inputPrice ?? 0;
  const nonCachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);

  const cost =
    (nonCachedInput * (inputPrice ?? 0)) / 1_000_000 +
    (usage.cachedInputTokens * cachedPrice) / 1_000_000 +
    (usage.outputTokens * (outputPrice ?? 0)) / 1_000_000;

  // Round to 6 decimal places to match the column precision.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

async function findPricing(modelId: string): Promise<CatalogModelRow | null> {
  try {
    const rows = await getCachedCatalogRows();
    return rows.find((row) => row.id === modelId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists one token-usage row. Fire-and-forget — never throws into callers.
 */
async function recordTokenUsage(
  context: TokenTrackingContext,
  modelId: string,
  provider: string | null,
  usage: NormalizedUsage,
): Promise<void> {
  try {
    const pricing = await findPricing(modelId);
    const estimatedCost = estimateCostUsd(usage, pricing);

    const admin = createAdminClient();
    const { error } = await admin.from("llm_token_usage").insert({
      user_id: context.userId,
      action_type: context.action,
      model_id: modelId,
      provider,
      used_default_key: context.usingDefaultKey,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      reasoning_tokens: usage.reasoningTokens,
      estimated_cost_usd: estimatedCost,
    });

    if (error) {
      console.error("[token-usage] insert failed:", error.message);
    }
  } catch (error) {
    console.error(
      "[token-usage] record failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Builds AI SDK middleware that captures usage from every generate call made
 * through the wrapped model and records it asynchronously.
 */
function createUsageCaptureMiddleware(
  context: TokenTrackingContext,
  modelId: string,
  provider: string | null,
): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      const usage = normalizeUsage(result.usage);
      // Do not await — recording must not delay the response to the user.
      void recordTokenUsage(context, modelId, provider, usage);
      return result;
    },
  };
}

/**
 * Wraps a model with token-usage capture middleware.
 */
export function wrapModelWithUsageTracking(
  model: LanguageModel,
  context: TokenTrackingContext,
  modelId: string,
  provider: string | null,
): LanguageModel {
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: createUsageCaptureMiddleware(context, modelId, provider),
  });
}
