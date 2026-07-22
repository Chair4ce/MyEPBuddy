import { describe, expect, it, vi } from "vitest";
import { loadFeedbackEpbStatements } from "../feedback-session-guide-loaders";
import type { VerifiedFeedbackRatee } from "../feedback-session-guide-loaders";

const ratee: VerifiedFeedbackRatee = {
  rank: "TSgt",
  name: "Jones",
  subordinateId: "sub-1",
  teamMemberId: null,
};

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const chainEnd = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const limit = vi.fn().mockReturnValue(chainEnd);
  const order = vi.fn().mockReturnValue({ limit });
  const neq = vi.fn().mockReturnValue({ order, limit, ...chainEnd });
  const eqAfterSelect = vi.fn().mockReturnValue({ neq, order, limit, ...chainEnd });
  const select = vi.fn().mockReturnValue({ eq: eqAfterSelect });
  const from = vi.fn().mockReturnValue({ select });

  return { from, maybeSingle };
}

describe("loadFeedbackEpbStatements", () => {
  it("returns a 500 NextResponse on query error", async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: "db down" },
    });

    const result = await loadFeedbackEpbStatements(supabase, ratee, 2026);

    expect(result.error).toBeDefined();
    expect(result.statements).toBeUndefined();
    expect(result.error?.status).toBe(500);
  });

  it("returns empty statements when no EPB shell exists", async () => {
    const supabase = createSupabaseMock({ data: null, error: null });

    const result = await loadFeedbackEpbStatements(supabase, ratee, 2026);

    expect(result.error).toBeUndefined();
    expect(result.statements).toEqual([]);
  });

  it("returns parsed statements when shell sections exist", async () => {
    const supabase = createSupabaseMock({
      data: {
        id: "shell-1",
        sections: [
          {
            mpa: "executing_mission",
            statement_text: " Led mission-critical ops ",
          },
          { mpa: "unknown_mpa", statement_text: "ignored" },
          { mpa: "leading_people", statement_text: "   " },
        ],
      },
      error: null,
    });

    const result = await loadFeedbackEpbStatements(supabase, ratee, 2026);

    expect(result.error).toBeUndefined();
    expect(result.statements).toEqual([
      {
        mpa: "executing_mission",
        text: "Led mission-critical ops",
      },
    ]);
  });
});
