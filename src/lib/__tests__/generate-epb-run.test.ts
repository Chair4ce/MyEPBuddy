import { describe, it, expect } from "vitest";
import {
  planToEditable,
  editableToMpaSelections,
  editableFromRecords,
  buildMpaCustomContext,
  buildGroupedMpaContexts,
  appendSentenceNote,
  combineVersions,
  extractVersionArrays,
  moveAccomplishmentToSlot,
  reorderSentenceGroups,
} from "../generate-epb-run";
import type { EpbPlan, PlanAccomplishmentRecord } from "../plan-epb";
import type { AccomplishmentMPARelevancy } from "@/types/database";

function rel(
  executing_mission: number,
  leading_people: number
): AccomplishmentMPARelevancy {
  return {
    executing_mission,
    leading_people,
    managing_resources: 20,
    improving_unit: 20,
  };
}

function record(
  id: string,
  taggedMpa: string,
  extras: Partial<PlanAccomplishmentRecord> = {}
): PlanAccomplishmentRecord {
  return {
    id,
    taggedMpa,
    action_verb: "Led",
    details: "did a thing",
    impact: null,
    metrics: null,
    overallScore: 70,
    primaryMpa: taggedMpa,
    mpaRelevancy: null,
    ...extras,
  };
}

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

  it("maps a plan to enabled editable groups and seeds empty core MPAs", () => {
    const editable = planToEditable(plan);
    expect(editable.executing_mission.enabled).toBe(true);
    expect(editable.executing_mission.groups).toEqual([["a", "b"], ["c"]]);
    expect(editable.executing_mission.notes).toEqual(["", ""]);
    expect(editable.leading_people.groups).toEqual([["d"]]);
    expect(editable.managing_resources.enabled).toBe(false);
    expect(editable.improving_unit.groups).toEqual([]);
  });

  it("preserves groups and derives sentence count from non-empty groups", () => {
    const selections = editableToMpaSelections(planToEditable(plan));
    const em = selections.find((s) => s.mpaKey === "executing_mission")!;
    expect(em.accomplishmentIds).toEqual(["a", "b", "c"]);
    expect(em.groups).toEqual([["a", "b"], ["c"]]);
    expect(em.notes).toEqual(["", ""]);
    expect(em.sentenceCount).toBe(2);
    const lp = selections.find((s) => s.mpaKey === "leading_people")!;
    expect(lp.sentenceCount).toBe(1);
    expect(lp.groups).toEqual([["d"]]);
  });

  it("skips disabled MPAs and empty groups", () => {
    const editable = planToEditable(plan);
    editable.executing_mission.enabled = false;
    editable.leading_people.groups = [[]];
    expect(editableToMpaSelections(editable)).toHaveLength(0);
  });

  it("carries trimmed per-sentence notes into selections", () => {
    const editable = planToEditable(plan);
    editable.executing_mission.notes = ["  emphasize tempo  ", "leave out manning"];
    const em = editableToMpaSelections(editable).find(
      (s) => s.mpaKey === "executing_mission"
    )!;
    expect(em.notes).toEqual(["emphasize tempo", "leave out manning"]);
  });
});

describe("editableFromRecords", () => {
  it("assigns up to two sentence groups via score-based planning", () => {
    const editable = editableFromRecords([
      record("a", "executing_mission", {
        action_verb: "Led",
        mpaRelevancy: rel(90, 20),
      }),
      record("b", "executing_mission", {
        action_verb: "Built",
        mpaRelevancy: rel(85, 20),
      }),
      record("c", "leading_people", {
        action_verb: "Mentored",
        mpaRelevancy: rel(20, 80),
      }),
      record("d", "miscellaneous"), // non-core → excluded
    ]);
    expect(editable.executing_mission.groups).toHaveLength(2);
    expect(editable.executing_mission.groups[0]).toEqual(["a"]);
    expect(editable.executing_mission.groups[1]).toEqual(["b"]);
    expect(editable.leading_people.enabled).toBe(true);
    expect(editable.leading_people.groups).toEqual([["c"]]);
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

  it("prefixes multi-entry groups with cumulative-effort instructions", () => {
    const text = buildMpaCustomContext([
      record("a", "executing_mission", {
        action_verb: "Volunteered",
        details: "at the USO for 4 hours",
        metrics: "4 hrs",
      }),
      record("b", "executing_mission", {
        action_verb: "Spent",
        details: "4 hours serving veterans at the USO",
        metrics: "4 hrs",
      }),
    ]);
    expect(text).toContain("SAME CUMULATIVE EFFORT");
    expect(text).toContain("ACCUMULATE metrics");
    expect(text).toContain("Volunteered: at the USO for 4 hours");
    expect(text).toContain("Spent: 4 hours serving veterans at the USO");
  });
});

describe("appendSentenceNote + buildGroupedMpaContexts", () => {
  it("appends rater guidance under the accomplishment body", () => {
    expect(appendSentenceNote("Led: x", "stress early finish")).toContain(
      "ADDITIONAL GUIDANCE FROM RATER"
    );
    expect(appendSentenceNote("Led: x", "stress early finish")).toContain(
      "stress early finish"
    );
    expect(appendSentenceNote("Led: x", "  ")).toBe("Led: x");
  });

  it("splits sentence groups into customContext and customContext2 with notes", () => {
    const byId = new Map(
      [
        record("a", "executing_mission", {
          action_verb: "Led",
          details: "first",
        }),
        record("b", "executing_mission", {
          action_verb: "Built",
          details: "second",
        }),
      ].map((r) => [r.id, r] as const)
    );
    expect(buildGroupedMpaContexts([["a"], ["b"]], byId)).toEqual({
      customContext: "Led: first",
      customContext2: "Built: second",
    });
    expect(
      buildGroupedMpaContexts([["a"], ["b"]], byId, ["note one", "note two"])
    ).toEqual({
      customContext:
        "Led: first\n\nADDITIONAL GUIDANCE FROM RATER:\nnote one",
      customContext2:
        "Built: second\n\nADDITIONAL GUIDANCE FROM RATER:\nnote two",
    });
    expect(buildGroupedMpaContexts([["a"]], byId)).toEqual({
      customContext: "Led: first",
    });
  });
});

describe("reorderSentenceGroups + moveAccomplishmentToSlot", () => {
  const base = planToEditable({
    mpas: [
      {
        mpaKey: "executing_mission",
        sentences: [
          { accomplishmentIds: ["a"], rationale: "" },
          { accomplishmentIds: ["b"], rationale: "" },
        ],
      },
      {
        mpaKey: "leading_people",
        sentences: [{ accomplishmentIds: ["c"], rationale: "" }],
      },
    ],
  });

  it("reorders sentences and keeps notes aligned", () => {
    const withNotes = {
      ...base,
      executing_mission: {
        ...base.executing_mission,
        notes: ["first note", "second note"],
      },
    };
    const next = reorderSentenceGroups(withNotes, "executing_mission", 0, 1);
    expect(next.executing_mission.groups).toEqual([["b"], ["a"]]);
    expect(next.executing_mission.notes).toEqual([
      "second note",
      "first note",
    ]);
  });

  it("moves an accomplishment across MPAs and enables the destination", () => {
    const next = moveAccomplishmentToSlot(
      base,
      { mpaKey: "executing_mission", groupIdx: 0, id: "a" },
      { mpaKey: "improving_unit", groupIdx: 0 }
    );
    expect(next.executing_mission.groups[0]).toEqual([]);
    expect(next.improving_unit.enabled).toBe(true);
    expect(next.improving_unit.groups).toEqual([["a"]]);
  });

  it("moves an accomplishment onto a new second sentence in another MPA", () => {
    const next = moveAccomplishmentToSlot(
      base,
      { mpaKey: "executing_mission", groupIdx: 1, id: "b" },
      { mpaKey: "leading_people", groupIdx: 1 }
    );
    expect(next.executing_mission.groups[1]).toEqual([]);
    expect(next.leading_people.groups).toEqual([["c"], ["b"]]);
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
