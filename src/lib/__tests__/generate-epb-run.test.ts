import { describe, it, expect } from "vitest";
import {
  planToEditable,
  editableToMpaSelections,
  buildMpaCustomContext,
  combineVersions,
  extractVersionArrays,
} from "../generate-epb-run";
import type { EpbPlan, PlanAccomplishmentRecord } from "../plan-epb";

describe("planToEditable + editableToMpaSelections", () => {
  const plan: EpbPlan = {
    mpas: [
      {
        mpaKey: "executing_mission",
        sentences: [
          { accomplishmentIds: ["a", "b"], rationale: "combine" },
          { accomplishmentIds: ["c"], rationale: "solo" },
        ],
      },
      {
        mpaKey: "leading_people",
        sentences: [{ accomplishmentIds: ["d"], rationale: "" }],
      },
    ],
  };

  it("maps a plan to enabled editable groups", () => {
    const editable = planToEditable(plan);
    expect(editable.executing_mission.enabled).toBe(true);
    expect(editable.executing_mission.groups).toEqual([["a", "b"], ["c"]]);
    expect(editable.leading_people.groups).toEqual([["d"]]);
  });

  it("unions ids and derives sentence count from non-empty groups", () => {
    const selections = editableToMpaSelections(planToEditable(plan));
    const em = selections.find((s) => s.mpaKey === "executing_mission")!;
    expect(em.accomplishmentIds).toEqual(["a", "b", "c"]);
    expect(em.sentenceCount).toBe(2);
    const lp = selections.find((s) => s.mpaKey === "leading_people")!;
    expect(lp.sentenceCount).toBe(1);
  });

  it("skips disabled MPAs and empty groups", () => {
    const editable = planToEditable(plan);
    editable.executing_mission.enabled = false;
    editable.leading_people.groups = [[]];
    expect(editableToMpaSelections(editable)).toHaveLength(0);
  });
});

describe("buildMpaCustomContext", () => {
  it("formats records like the fuse flow", () => {
    const records: PlanAccomplishmentRecord[] = [
      {
        id: "a",
        taggedMpa: "executing_mission",
        action_verb: "Led",
        details: "migration",
        impact: "zero downtime",
        metrics: "50 servers",
        overallScore: 80,
        primaryMpa: "executing_mission",
        mpaRelevancy: null,
      },
    ];
    expect(buildMpaCustomContext(records)).toBe(
      "Led: migration. Impact: zero downtime. Metrics: 50 servers"
    );
  });
});

describe("combineVersions", () => {
  it("caps at sentence count and joins with proper separator", () => {
    expect(
      combineVersions([["First.", "Second."], ["Only"]], 2)
    ).toEqual(["First. Second.", "Only"]);
    expect(combineVersions([["First", "Second"]], 1)).toEqual(["First"]);
    expect(combineVersions([["First", "Second"]], 2)).toEqual([
      "First. Second",
    ]);
  });

  it("drops empty versions", () => {
    expect(combineVersions([[""], ["Real"]], 1)).toEqual(["Real"]);
  });
});

describe("extractVersionArrays", () => {
  it("prefers statementVersions, falls back to statements", () => {
    expect(
      extractVersionArrays({ statementVersions: [["a"], ["b"]] })
    ).toEqual([["a"], ["b"]]);
    expect(extractVersionArrays({ statements: ["a", "b"] })).toEqual([
      ["a", "b"],
    ]);
    expect(extractVersionArrays(null)).toEqual([]);
    expect(extractVersionArrays({})).toEqual([]);
  });
});
