import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVISE_SELECTION_USAGE_CHECKS_PER_REQUEST,
  SYNONYMS_CONSUME_CREDIT,
} from "../synonyms-billing-contract";

describe("synonym vs phrase-revise billing contract", () => {
  it("marks synonym suggestions as unbilled", () => {
    expect(SYNONYMS_CONSUME_CREDIT).toBe(false);
  });

  it("keeps the synonyms route off consume_credit", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/synonyms/route.ts"),
      "utf8",
    );

    expect(src).toContain("allowUnbilledLlmUsage");
    expect(src).not.toContain("checkAndTrackUsage");
    expect(src).not.toContain("handleBillableLLMError");
    expect(src).not.toContain("consume_credit");
  });

  it("keeps expand / compress / rephrase on a single credit consume", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/revise-selection/route.ts"),
      "utf8",
    );

    const consumeCalls = src.match(/checkAndTrackUsage\(/g) ?? [];
    expect(consumeCalls).toHaveLength(REVISE_SELECTION_USAGE_CHECKS_PER_REQUEST);
    expect(src).toContain("revise_selection");
    expect(src).toContain("handleBillableLLMError");
    expect(src).toContain("reviseTrackingAction");
    expect(src).toContain("withTrackingAction");
  });
});
