import { describe, expect, it } from "vitest";
import {
  isSubstantialEpbStatement,
  majorityMpa,
} from "@/lib/fuse-to-epb";

describe("isSubstantialEpbStatement", () => {
  it("rejects empty, tiny, and single-token junk", () => {
    expect(isSubstantialEpbStatement("")).toBe(false);
    expect(isSubstantialEpbStatement(".")).toBe(false);
    expect(isSubstantialEpbStatement("Draft")).toBe(false);
    expect(isSubstantialEpbStatement("x".repeat(50))).toBe(false);
  });

  it("accepts multi-word drafts at the length floor", () => {
    const draft =
      "Led flight training that cut prep time and restored sortie capacity.";
    expect(draft.length).toBeGreaterThanOrEqual(40);
    expect(isSubstantialEpbStatement(draft)).toBe(true);
  });
});

describe("majorityMpa", () => {
  const valid = new Set([
    "executing_mission",
    "leading_people",
    "managing_resources",
    "improving_unit",
  ]);

  it("picks the most common valid MPA", () => {
    expect(
      majorityMpa(
        [
          { mpa: "leading_people" },
          { mpa: "leading_people" },
          { mpa: "executing_mission" },
          { mpa: "miscellaneous" },
        ],
        valid
      )
    ).toBe("leading_people");
  });

  it("falls back when nothing is valid", () => {
    expect(majorityMpa([{ mpa: "miscellaneous" }], valid)).toBe(
      "executing_mission"
    );
  });
});
