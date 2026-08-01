import { describe, expect, it } from "vitest";
import { clampGenerateVersionCount } from "@/lib/generate-version-count";

describe("clampGenerateVersionCount", () => {
  it("defaults missing/invalid values to 1", () => {
    expect(clampGenerateVersionCount(undefined)).toBe(1);
    expect(clampGenerateVersionCount(null)).toBe(1);
    expect(clampGenerateVersionCount("")).toBe(1);
    expect(clampGenerateVersionCount("abc")).toBe(1);
    expect(clampGenerateVersionCount(NaN)).toBe(1);
  });

  it("clamps to 1–3", () => {
    expect(clampGenerateVersionCount(0)).toBe(1);
    expect(clampGenerateVersionCount(-2)).toBe(1);
    expect(clampGenerateVersionCount(1)).toBe(1);
    expect(clampGenerateVersionCount(2)).toBe(2);
    expect(clampGenerateVersionCount(3)).toBe(3);
    expect(clampGenerateVersionCount(9)).toBe(3);
    expect(clampGenerateVersionCount(2.9)).toBe(2);
  });
});
