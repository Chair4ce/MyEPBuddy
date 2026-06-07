import { NextResponse } from "next/server";
import {
  handleBurstRateLimited,
  handleInsufficientCredits,
} from "@/lib/llm-error-handler";
import type { UsageCheckResult } from "@/lib/usage-tracker";

export function enforceUsageGate(usageCheck: UsageCheckResult): NextResponse {
  if (usageCheck.rateLimited) {
    return handleBurstRateLimited();
  }
  if (usageCheck.serviceError) {
    return NextResponse.json(
      {
        error:
          "Unable to verify your usage right now. Please try again in a moment.",
        errorCode: "usage_check_failed",
      },
      { status: 503 },
    );
  }
  return handleInsufficientCredits();
}

export function applyCreditsHeader<T extends Response>(
  response: T,
  usageCheck: UsageCheckResult,
): T {
  if (
    usageCheck.usingDefaultKey &&
    usageCheck.creditsRemaining !== undefined
  ) {
    response.headers.set(
      "X-Credits-Remaining",
      String(usageCheck.creditsRemaining),
    );
  }
  return response;
}

export function jsonWithCredits<T>(
  data: T,
  usageCheck: UsageCheckResult,
  init?: ResponseInit,
): NextResponse {
  const response = NextResponse.json(data, init);
  return applyCreditsHeader(response, usageCheck);
}
