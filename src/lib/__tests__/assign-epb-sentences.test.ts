import { describe, it, expect } from "vitest";
import {
  allocateEpbCandidatePools,
  assignEpbSentenceGroups,
  MAX_CANDIDATES_PER_MPA,
  MIN_CROSS_FILL_RELEVANCY,
  poolsToFallbackPlan,
  relevancyForMpa,
  TARGET_CANDIDATES_PER_MPA,
  UNASSESSED_HOME_RELEVANCY,
} from "../assign-epb-sentences";
import type { PlanAccomplishmentRecord } from "../plan-epb";
import type { AccomplishmentMPARelevancy } from "@/types/database";

function rel(
  executing_mission: number,
  leading_people: number,
  managing_resources = 20,
  improving_unit = 20
): AccomplishmentMPARelevancy {
  return {
    executing_mission,
    leading_people,
    managing_resources,
    improving_unit,
  };
}

function record(
  overrides: Partial<PlanAccomplishmentRecord> & { id: string }
): PlanAccomplishmentRecord {
  return {
    taggedMpa: "executing_mission",
    action_verb: "Led",
    details: "did a thing",
    impact: null,
    metrics: null,
    overallScore: 70,
    primaryMpa: "executing_mission",
    mpaRelevancy: rel(70, 20),
    ...overrides,
  };
}

describe("relevancyForMpa", () => {
  it("reads assessed relevancy and falls back for unassessed home tags", () => {
    const assessed = record({
      id: "a",
      mpaRelevancy: rel(90, 40),
    });
    expect(relevancyForMpa(assessed, "executing_mission")).toBe(90);
    expect(relevancyForMpa(assessed, "leading_people")).toBe(40);

    const unassessed = record({
      id: "b",
      taggedMpa: "leading_people",
      mpaRelevancy: null,
    });
    expect(relevancyForMpa(unassessed, "leading_people")).toBe(
      UNASSESSED_HOME_RELEVANCY
    );
    expect(relevancyForMpa(unassessed, "executing_mission")).toBe(0);
  });
});

describe("allocateEpbCandidatePools", () => {
  it("keeps strongest home candidates and stashes overflow for cross-fill", () => {
    const many = Array.from({ length: MAX_CANDIDATES_PER_MPA + 3 }, (_, i) =>
      record({
        id: `em${i}`,
        action_verb: i % 2 === 0 ? "Volunteered" : "Spent",
        details:
          i % 2 === 0
            ? `Volunteered at the USO for 4 hours day ${i}`
            : `Spent 4 hours serving veterans at the USO day ${i}`,
        mpaRelevancy: rel(95 - i, 50 + (i % 3)),
        overallScore: 95 - i,
      })
    );
    // LP needs fill from EM leftovers that score well for LP
    const lpHome = record({
      id: "lp1",
      taggedMpa: "leading_people",
      action_verb: "Mentored",
      primaryMpa: "leading_people",
      mpaRelevancy: rel(20, 80),
    });

    const pools = allocateEpbCandidatePools([...many, lpHome]);
    expect(pools.executing_mission).toHaveLength(MAX_CANDIDATES_PER_MPA);
    expect(pools.leading_people.length).toBeGreaterThanOrEqual(
      TARGET_CANDIDATES_PER_MPA
    );
    expect(pools.leading_people).toContain("lp1");
    // Cross-filled from stash (overflow beyond MAX)
    const cross = pools.leading_people.filter((id) => id !== "lp1");
    expect(cross.length).toBeGreaterThan(0);
    for (const id of cross) {
      expect(pools.executing_mission).not.toContain(id);
    }
  });

  it("does not cross-fill below the normal floor when desperate is not needed", () => {
    const pools = allocateEpbCandidatePools([
      record({
        id: "em1",
        mpaRelevancy: rel(90, MIN_CROSS_FILL_RELEVANCY - 1),
      }),
      record({
        id: "em2",
        action_verb: "Built",
        mpaRelevancy: rel(85, 10),
      }),
    ]);
    expect(pools.executing_mission.sort()).toEqual(["em1", "em2"]);
    expect(pools.leading_people).toEqual([]);
  });

  it("uses each accomplishment at most once across pools", () => {
    const pools = allocateEpbCandidatePools([
      record({ id: "a", mpaRelevancy: rel(90, 88) }),
      record({ id: "b", action_verb: "Built", mpaRelevancy: rel(70, 65) }),
      record({ id: "c", action_verb: "Drove", mpaRelevancy: rel(60, 55) }),
      record({
        id: "d",
        taggedMpa: "leading_people",
        action_verb: "Coached",
        mpaRelevancy: rel(40, 80),
      }),
    ]);
    const allIds = Object.values(pools).flat();
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe("poolsToFallbackPlan / assignEpbSentenceGroups", () => {
  it("falls back to top-score singleton groups without verb clustering", () => {
    // Same verb, different efforts — fallback must NOT merge by verb.
    const records = [
      record({
        id: "uso",
        action_verb: "Volunteered",
        details: "Volunteered at the USO for 4 hours",
        mpaRelevancy: rel(90, 20),
        overallScore: 90,
      }),
      record({
        id: "pt",
        action_verb: "Volunteered",
        details: "Volunteered to lead squadron PT for 12 Airmen",
        mpaRelevancy: rel(80, 20),
        overallScore: 80,
      }),
      record({
        id: "net",
        action_verb: "Led",
        details: "Led network migration",
        mpaRelevancy: rel(70, 20),
        overallScore: 70,
      }),
    ];
    const plan = assignEpbSentenceGroups(records);
    const em = plan.mpas.find((m) => m.mpaKey === "executing_mission")!;
    expect(em.sentences).toHaveLength(2);
    expect(em.sentences[0]!.accomplishmentIds).toEqual(["uso"]);
    expect(em.sentences[1]!.accomplishmentIds).toEqual(["pt"]);
    // Third stays out of fallback (only 2 sentences) — not verb-merged into either
    expect(
      em.sentences.flatMap((s) => s.accomplishmentIds)
    ).not.toContain("net");
  });

  it("poolsToFallbackPlan mirrors assignEpbSentenceGroups", () => {
    const records = [
      record({ id: "a", mpaRelevancy: rel(90, 20) }),
      record({ id: "b", action_verb: "Built", mpaRelevancy: rel(80, 20) }),
    ];
    const pools = allocateEpbCandidatePools(records);
    expect(poolsToFallbackPlan(pools, records)).toEqual(
      assignEpbSentenceGroups(records)
    );
  });
});
