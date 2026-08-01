import { describe, expect, it } from "vitest";
import {
  isSubstantialEpbStatement,
  majorityMpa,
  toGenerateAccomplishmentPayload,
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

  it("on a tie keeps the first-seen winner among equals", () => {
    expect(
      majorityMpa(
        [
          { mpa: "executing_mission" },
          { mpa: "leading_people" },
          { mpa: "executing_mission" },
          { mpa: "leading_people" },
        ],
        valid
      )
    ).toBe("executing_mission");
  });
});

describe("toGenerateAccomplishmentPayload", () => {
  const base = {
    id: "a1",
    mpa: "executing_mission",
    action_verb: "Led",
    details: "sortie recovery",
    impact: "legacy impact",
    metrics: "12 sorties",
  };

  it("prefers composed stewardship impact over legacy impact", () => {
    const payload = toGenerateAccomplishmentPayload({
      ...base,
      stewardship_impact: { time: "3 mos early", money: "$12K" },
    });
    expect(payload.impact).not.toBe("legacy impact");
    expect(payload.impact).toContain("3 mos early");
    expect(payload.impact).toContain("$12K");
    expect(payload.metrics).toBe("12 sorties");
  });

  it("falls back to legacy impact when stewardship is empty", () => {
    expect(
      toGenerateAccomplishmentPayload({
        ...base,
        stewardship_impact: {},
      }).impact
    ).toBe("legacy impact");
  });
});
