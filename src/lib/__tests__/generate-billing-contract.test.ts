import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATE_USAGE_CHECKS_PER_REQUEST,
  shouldRefundGenerateForEmptyResults,
} from "../generate-billing-contract";
import { clampGenerateVersionCount } from "../generate-version-count";

describe("generate billing contract", () => {
  it("allows up to 3 versions under a single credit", () => {
    expect(clampGenerateVersionCount(3)).toBe(3);
    expect(GENERATE_USAGE_CHECKS_PER_REQUEST).toBe(1);
  });

  it("refunds when there are no usable results", () => {
    expect(shouldRefundGenerateForEmptyResults(0)).toBe(true);
    expect(shouldRefundGenerateForEmptyResults(1)).toBe(false);
    expect(shouldRefundGenerateForEmptyResults(3)).toBe(false);
  });

  it("keeps the route on the one-consume / empty-refund contract", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/generate/route.ts",
    );
    const src = readFileSync(routePath, "utf8");

    const consumeCalls = src.match(/checkAndTrackUsage\(/g) ?? [];
    expect(consumeCalls).toHaveLength(GENERATE_USAGE_CHECKS_PER_REQUEST);

    expect(src).toContain("shouldRefundGenerateForEmptyResults");
    expect(src).toContain("refundAndError");
    expect(src).toContain("clampGenerateVersionCount");

    // Versions fan out after the single usage check, not inside a per-version debit.
    const usageIdx = src.indexOf("checkAndTrackUsage(");
    const versionsIdx = src.indexOf("Array.from({ length: versionCount }");
    expect(usageIdx).toBeGreaterThan(-1);
    expect(versionsIdx).toBeGreaterThan(usageIdx);
  });
});
