import { describe, it, expect } from "vitest";
import {
  applyCreditsHeader,
  enforceUsageGate,
  jsonWithCredits,
} from "../usage-gate";
import type { UsageCheckResult } from "../usage-tracker";

function baseCheck(overrides: Partial<UsageCheckResult> = {}): UsageCheckResult {
  return {
    allowed: false,
    usingDefaultKey: true,
    effectiveModel: "gemini-2.5-flash-lite",
    ...overrides,
  };
}

describe("enforceUsageGate", () => {
  it("returns 429 burst response when rate limited", async () => {
    const response = enforceUsageGate(baseCheck({ rateLimited: true }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.errorCode).toBe("burst_rate_limited");
  });

  it("returns 503 when usage RPC fails (fail closed)", async () => {
    const response = enforceUsageGate(baseCheck({ serviceError: true }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.errorCode).toBe("usage_check_failed");
  });

  it("returns 402 insufficient credits by default", async () => {
    const response = enforceUsageGate(baseCheck());
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.errorCode).toBe("insufficient_credits");
  });

  it("prioritizes rate limit over service error", async () => {
    const response = enforceUsageGate(
      baseCheck({ rateLimited: true, serviceError: true }),
    );
    expect(response.status).toBe(429);
  });
});

describe("applyCreditsHeader", () => {
  it("sets X-Credits-Remaining for default-key responses", () => {
    const response = new Response("ok");
    applyCreditsHeader(
      response,
      baseCheck({ allowed: true, creditsRemaining: 42 }),
    );
    expect(response.headers.get("X-Credits-Remaining")).toBe("42");
  });

  it("skips header for BYOK responses", () => {
    const response = new Response("ok");
    applyCreditsHeader(
      response,
      baseCheck({
        usingDefaultKey: false,
        creditsRemaining: 42,
      }),
    );
    expect(response.headers.get("X-Credits-Remaining")).toBeNull();
  });
});

describe("jsonWithCredits", () => {
  it("returns JSON with credits header", async () => {
    const response = jsonWithCredits(
      { ok: true },
      baseCheck({ allowed: true, creditsRemaining: 7 }),
    );
    expect(response.headers.get("X-Credits-Remaining")).toBe("7");
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });
});
