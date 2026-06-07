import { NextResponse } from "next/server";
import { handleLLMError } from "@/lib/llm-error-handler";
import { applyCreditsHeader } from "@/lib/usage-gate";
import { computeEffectiveIdempotencyKey } from "@/lib/billing/idempotency";
import { refundBillableCreditIfNeeded } from "@/lib/billing/refund-credit";
import {
  getCachedBillableResponse,
  storeBillableResponse,
} from "@/lib/billing/response-cache";
import type { UsageCheckResult } from "@/lib/usage-tracker";

export interface BillableRequestContext {
  userId: string;
  idempotencyKey: string;
  usageCheck: UsageCheckResult | null;
}

export async function createBillableRequestContext(
  request: Request,
  userId: string,
): Promise<Omit<BillableRequestContext, "usageCheck">> {
  return {
    userId,
    idempotencyKey: await computeEffectiveIdempotencyKey(request, userId),
  };
}

/**
 * Short-circuit a billable request when a prior identical request already
 * succeeded: returns the cached response (no credit charge, no LLM call).
 * Call this right after building the context, before checkAndTrackUsage.
 */
export async function getReplayedBillableResponse(
  ctx: Pick<BillableRequestContext, "userId" | "idempotencyKey">,
): Promise<NextResponse | null> {
  return getCachedBillableResponse(ctx.userId, ctx.idempotencyKey);
}

/**
 * Build the success JSON response AND cache it for idempotent replay.
 * Mirrors jsonWithCredits (sets X-Credits-Remaining), then persists the payload
 * keyed by the effective idempotency key.
 */
export async function cacheBillableJson<T>(
  ctx: BillableRequestContext | null,
  data: T,
  usageCheck: UsageCheckResult,
  init?: ResponseInit,
): Promise<NextResponse> {
  const response = applyCreditsHeader(NextResponse.json(data, init), usageCheck);

  if (ctx && usageCheck.usingDefaultKey) {
    await storeBillableResponse({
      userId: ctx.userId,
      idempotencyKey: ctx.idempotencyKey,
      actionType: ctx.usageCheck?.tracking?.action ?? null,
      payload: data,
      creditsRemaining: usageCheck.creditsRemaining ?? null,
    });
  }

  return response;
}

/**
 * Return an error response AND refund the consumed token. Use at any failure
 * path that occurs AFTER the credit was charged (e.g. unparseable model output,
 * invalid structure) so a failed request never costs the user a token.
 */
export async function refundAndError(
  ctx: BillableRequestContext | null,
  body: Record<string, unknown>,
  init?: ResponseInit,
): Promise<NextResponse> {
  let refundedBalance: number | null = null;
  if (ctx) {
    refundedBalance = await refundBillableCreditIfNeeded(
      ctx.userId,
      ctx.idempotencyKey,
      ctx.usageCheck,
    );
  }
  const response = NextResponse.json(body, init);
  if (refundedBalance !== null) {
    response.headers.set("X-Credits-Remaining", String(refundedBalance));
  }
  return response;
}

export async function handleBillableLLMError(
  error: unknown,
  routeContext: string,
  modelId: string | undefined,
  ctx: BillableRequestContext,
): Promise<NextResponse> {
  const refundedBalance = await refundBillableCreditIfNeeded(
    ctx.userId,
    ctx.idempotencyKey,
    ctx.usageCheck,
  );
  const response = handleLLMError(error, routeContext, modelId);
  if (refundedBalance !== null) {
    response.headers.set("X-Credits-Remaining", String(refundedBalance));
  }
  return response;
}
