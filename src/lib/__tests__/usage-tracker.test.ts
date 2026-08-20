import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowUnbilledLlmUsage, checkAndTrackUsage } from "../usage-tracker";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mockRpc,
  })),
}));

describe("checkAndTrackUsage", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("fail-closes when BYOK usage RPC errors", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Access denied" },
    });

    const result = await checkAndTrackUsage(
      "user-1",
      "generate",
      "gpt-4o",
      { openai_key: "sk-test" },
    );

    expect(result.allowed).toBe(false);
    expect(result.serviceError).toBe(true);
    expect(result.tracking).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      "check_and_record_usage",
      expect.objectContaining({
        p_user_id: "user-1",
        p_action_type: "generate",
      }),
    );
  });

  it("consumes credit for default-key users", async () => {
    mockRpc.mockResolvedValueOnce({
      data: 99,
      error: null,
    });

    const result = await checkAndTrackUsage(
      "user-1",
      "generate",
      "gemini-2.5-flash-lite",
      null,
    );

    expect(result.allowed).toBe(true);
    expect(result.usingDefaultKey).toBe(true);
    expect(result.creditsRemaining).toBe(99);
    expect(result.tracking).toBeDefined();
    expect(mockRpc).toHaveBeenCalledWith(
      "consume_credit",
      expect.objectContaining({
        p_user_id: "user-1",
        p_action_type: "generate",
        p_idempotency_key: null,
      }),
    );
  });

  it("returns insufficient credits when balance is zero", async () => {
    mockRpc.mockResolvedValueOnce({
      data: -2,
      error: null,
    });

    const result = await checkAndTrackUsage(
      "user-1",
      "generate",
      "gemini-2.5-flash-lite",
      null,
    );

    expect(result.allowed).toBe(false);
    expect(result.insufficientCredits).toBe(true);
    expect(result.serviceError).toBeFalsy();
  });

  it("fail-closes as serviceError when consume_credit RPC errors", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "connection timeout" },
    });

    const result = await checkAndTrackUsage(
      "user-1",
      "generate",
      "gemini-2.5-flash-lite",
      null,
    );

    expect(result.allowed).toBe(false);
    expect(result.serviceError).toBe(true);
    expect(result.insufficientCredits).toBeFalsy();
    expect(mockRpc).toHaveBeenCalledWith(
      "consume_credit",
      expect.objectContaining({
        p_user_id: "user-1",
        p_action_type: "generate",
      }),
    );
  });
});

describe("allowUnbilledLlmUsage", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("does not consume a credit for default-key users", async () => {
    const result = await allowUnbilledLlmUsage(
      "user-1",
      "synonyms",
      "gemini-2.5-flash-lite",
      null,
    );

    expect(result.allowed).toBe(true);
    expect(result.usingDefaultKey).toBe(true);
    expect(result.insufficientCredits).toBeFalsy();
    expect(result.creditsRemaining).toBeUndefined();
    expect(result.tracking).toEqual({
      subjectId: "user-1",
      action: "synonyms",
      usingDefaultKey: true,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("still burst-limits BYOK users without consuming credits", async () => {
    mockRpc.mockResolvedValueOnce({
      data: 1,
      error: null,
    });

    const result = await allowUnbilledLlmUsage(
      "user-1",
      "synonyms",
      "gpt-4o",
      { openai_key: "sk-test" },
    );

    expect(result.allowed).toBe(true);
    expect(result.usingDefaultKey).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith(
      "check_and_record_usage",
      expect.objectContaining({
        p_user_id: "user-1",
        p_action_type: "synonyms",
      }),
    );
    expect(mockRpc).not.toHaveBeenCalledWith(
      "consume_credit",
      expect.anything(),
    );
  });
});
