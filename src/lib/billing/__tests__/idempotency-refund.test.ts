import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeEffectiveIdempotencyKey,
  createIdempotencyKey,
  getIdempotencyKeyFromRequest,
} from "../idempotency";

function makeRequest(key: string | undefined, body: string): Request {
  return new Request("https://example.com/api/generate", {
    method: "POST",
    headers: key ? { "Idempotency-Key": key } : {},
    body,
  });
}

describe("idempotency", () => {
  it("accepts valid client idempotency keys", () => {
    const key = "550e8400-e29b-41d4-a716-446655440000";
    const request = makeRequest(key, "{}");
    expect(getIdempotencyKeyFromRequest(request)).toBe(key);
  });

  it("rejects malformed idempotency keys", () => {
    const request = makeRequest(undefined, "{}");
    request.headers.set("Idempotency-Key", "bad key!");
    expect(getIdempotencyKeyFromRequest(request)).toBeNull();
  });

  it("generates UUID keys", () => {
    expect(createIdempotencyKey()).toMatch(/^[\w-]{8,128}$/);
  });

  it("dedupes identical key + body (genuine retry)", async () => {
    const a = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":1}'), "user-1");
    const b = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":1}'), "user-1");
    expect(a).toBe(b);
  });

  it("does NOT dedupe a reused key with a different body (abuse vector)", async () => {
    const a = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":1}'), "user-1");
    const b = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":2}'), "user-1");
    expect(a).not.toBe(b);
  });

  it("scopes the effective key per user", async () => {
    const a = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":1}'), "user-1");
    const b = await computeEffectiveIdempotencyKey(makeRequest("dup-key-123", '{"x":1}'), "user-2");
    expect(a).not.toBe(b);
  });
});

describe("refundBillableCreditIfNeeded", () => {
  const mockRpc = vi.fn();

  beforeEach(() => {
    mockRpc.mockReset();
    vi.resetModules();
  });

  it("skips refund for BYOK users", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
    }));

    const { refundBillableCreditIfNeeded } = await import("../refund-credit");

    const result = await refundBillableCreditIfNeeded("user-1", "key-1", {
      allowed: true,
      usingDefaultKey: false,
      effectiveModel: "gpt-4o",
    });

    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refunds default-key billable failures", async () => {
    mockRpc.mockResolvedValueOnce({ data: 42, error: null });

    vi.doMock("@/lib/supabase/server", () => ({
      createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
    }));

    const { refundBillableCreditIfNeeded } = await import("../refund-credit");

    const result = await refundBillableCreditIfNeeded("user-1", "key-1", {
      allowed: true,
      usingDefaultKey: true,
      effectiveModel: "gemini-2.5-flash-lite",
      creditsRemaining: 41,
    });

    expect(result).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith("refund_credit", {
      p_user_id: "user-1",
      p_idempotency_key: "key-1",
      p_reason: "AI request failed before completion",
    });
  });
});

describe("response cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function mockCacheClient(row: Record<string, unknown> | null) {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
      upsert,
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createAdminClient: vi.fn(() => ({ from })),
    }));
    return { upsert, maybeSingle, from };
  }

  it("returns null when nothing is cached", async () => {
    mockCacheClient(null);
    const { getCachedBillableResponse } = await import("../response-cache");
    const result = await getCachedBillableResponse("user-1", "idk-1");
    expect(result).toBeNull();
  });

  it("replays a cached response with replay + credits headers", async () => {
    mockCacheClient({ response: { statements: ["a"] }, credits_remaining: 7 });
    const { getCachedBillableResponse } = await import("../response-cache");
    const result = await getCachedBillableResponse("user-1", "idk-1");
    expect(result).not.toBeNull();
    expect(result!.headers.get("X-Idempotent-Replay")).toBe("1");
    expect(result!.headers.get("X-Credits-Remaining")).toBe("7");
    await expect(result!.json()).resolves.toEqual({ statements: ["a"] });
  });

  it("upserts with first-write-wins semantics", async () => {
    const { upsert } = mockCacheClient(null);
    const { storeBillableResponse } = await import("../response-cache");
    await storeBillableResponse({
      userId: "user-1",
      idempotencyKey: "idk-1",
      actionType: "generate",
      payload: { ok: true },
      creditsRemaining: 5,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        idempotency_key: "idk-1",
        action_type: "generate",
        response: { ok: true },
        credits_remaining: 5,
      }),
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    );
  });
});
