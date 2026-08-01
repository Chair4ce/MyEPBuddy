import { describe, expect, it } from "vitest";
import {
  collectFormattingViolationLabels,
  formatFormattingViolationNote,
  hasFormattingRemaining,
} from "@/lib/formatting-violation-note";

describe("formatting-violation-note", () => {
  it("collects unique violation labels", () => {
    expect(
      collectFormattingViolationLabels([
        { violations: ["w/", ";"], remaining: [], method: "deterministic", attempts: 0 },
        { violations: ["w/"], remaining: [], method: "deterministic", attempts: 0 },
      ])
    ).toEqual(["w/", ";"]);
  });

  it("formats a repaired-only note", () => {
    expect(
      formatFormattingViolationNote([
        { violations: ["w/"], remaining: [], method: "deterministic", attempts: 0 },
      ])
    ).toBe("Auto-fixed banned formatting (w/)");
  });

  it("formats a note when residue remains", () => {
    expect(
      formatFormattingViolationNote([
        {
          violations: ["w/", ";"],
          remaining: [";"],
          method: "llm",
          attempts: 2,
        },
      ])
    ).toBe("Auto-fixed banned formatting (w/, ;); some may remain (;)");
  });

  it("detects remaining violations", () => {
    expect(hasFormattingRemaining([{ violations: ["w/"], remaining: [], method: "none", attempts: 0 }])).toBe(false);
    expect(hasFormattingRemaining([{ violations: ["w/"], remaining: [";"], method: "llm", attempts: 1 }])).toBe(true);
  });
});
