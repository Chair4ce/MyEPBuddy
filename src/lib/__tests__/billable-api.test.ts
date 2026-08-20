import { describe, expect, it, vi } from "vitest";
import {
  BILLABLE_API_PATHS,
  isBillableApiRequest,
  maybeOptimisticConsume,
} from "../billable-api";

const { applyOptimisticConsume } = vi.hoisted(() => ({
  applyOptimisticConsume: vi.fn(),
}));

vi.mock("@/stores/credits-store", () => ({
  useCreditsStore: {
    getState: () => ({
      applyOptimisticConsume,
      fetchCredits: vi.fn(),
    }),
  },
}));

describe("billable API paths", () => {
  it("does not treat synonym suggestions as a credit charge", () => {
    expect(BILLABLE_API_PATHS).not.toContain("/api/synonyms");
    expect(isBillableApiRequest("/api/synonyms", "POST")).toBe(false);
    expect(isBillableApiRequest("/api/dictionary-synonyms", "GET")).toBe(false);
  });

  it("still charges expand / compress / rephrase via revise-selection", () => {
    expect(BILLABLE_API_PATHS).toContain("/api/revise-selection");
    expect(isBillableApiRequest("/api/revise-selection", "POST")).toBe(true);
    expect(isBillableApiRequest("/api/revise-selection", "GET")).toBe(false);
  });

  it("does not optimistic-consume on synonym POSTs", () => {
    applyOptimisticConsume.mockClear();
    maybeOptimisticConsume("/api/synonyms", "POST");
    expect(applyOptimisticConsume).not.toHaveBeenCalled();

    maybeOptimisticConsume("/api/revise-selection", "POST");
    expect(applyOptimisticConsume).toHaveBeenCalledTimes(1);
  });
});
