import { describe, it, expect } from "vitest";
import {
  assignEpbSentenceGroups,
  clusterByActionVerb,
  MIN_CROSS_FILL_RELEVANCY,
  relevancyForMpa,
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

describe("clusterByActionVerb", () => {
  it("groups same verbs and ranks clusters by best MPA fit", () => {
    const clusters = clusterByActionVerb(
      [
        record({ id: "1", action_verb: "Led", mpaRelevancy: rel(60, 10) }),
        record({ id: "2", action_verb: "Led", mpaRelevancy: rel(80, 10) }),
        record({ id: "3", action_verb: "Built", mpaRelevancy: rel(95, 10) }),
      ],
      "executing_mission"
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.map((r) => r.id)).toEqual(["3"]);
    expect(clusters[1]!.map((r) => r.id)).toEqual(["2", "1"]);
  });
});

describe("assignEpbSentenceGroups", () => {
  it("takes the two strongest distinct ARIs for a rich MPA and stashes the rest", () => {
    // User example: 5 EM entries — best distinct verbs become 2 sentences.
    const plan = assignEpbSentenceGroups([
      record({
        id: "1",
        action_verb: "Managed",
        mpaRelevancy: rel(60, 45),
        overallScore: 60,
      }),
      record({
        id: "2",
        action_verb: "Led",
        mpaRelevancy: rel(78, 50),
        overallScore: 78,
      }),
      record({
        id: "3",
        action_verb: "Built",
        mpaRelevancy: rel(88, 55),
        overallScore: 88,
      }),
      record({
        id: "4",
        action_verb: "Tracked",
        mpaRelevancy: rel(40, 30),
        overallScore: 40,
      }),
      record({
        id: "5",
        action_verb: "Directed",
        mpaRelevancy: rel(90, 70),
        overallScore: 90,
      }),
    ]);

    const em = plan.mpas.find((m) => m.mpaKey === "executing_mission")!;
    expect(em.sentences).toHaveLength(2);
    expect(em.sentences[0]!.accomplishmentIds).toEqual(["5"]);
    expect(em.sentences[1]!.accomplishmentIds).toEqual(["3"]);

    // Leftovers with strong Leading People fit fill that empty MPA.
    const lp = plan.mpas.find((m) => m.mpaKey === "leading_people");
    expect(lp).toBeDefined();
    expect(lp!.sentences.length).toBeGreaterThanOrEqual(1);
    const lpIds = lp!.sentences.flatMap((s) => s.accomplishmentIds);
    expect(lpIds).toContain("2"); // 50% LP — above cross-fill floor
    expect(lpIds).not.toContain("5");
    expect(lpIds).not.toContain("3");
  });

  it("combines cumulative same-verb home entries into one sentence then pops stash for the second", () => {
    const plan = assignEpbSentenceGroups([
      // Leading People: two cumulative "Mentored" entries → 1 sentence
      record({
        id: "lp1",
        taggedMpa: "leading_people",
        action_verb: "Mentored",
        primaryMpa: "leading_people",
        mpaRelevancy: rel(30, 82),
        overallScore: 82,
      }),
      record({
        id: "lp2",
        taggedMpa: "leading_people",
        action_verb: "Mentored",
        primaryMpa: "leading_people",
        mpaRelevancy: rel(25, 75),
        overallScore: 75,
      }),
      // Executing Mission leftovers that also score well for Leading People
      record({
        id: "em1",
        action_verb: "Led",
        mpaRelevancy: rel(92, 68),
        overallScore: 92,
      }),
      record({
        id: "em2",
        action_verb: "Built",
        mpaRelevancy: rel(85, 62),
        overallScore: 85,
      }),
      record({
        id: "em3",
        action_verb: "Directed",
        mpaRelevancy: rel(80, 58),
        overallScore: 80,
      }),
    ]);

    const lp = plan.mpas.find((m) => m.mpaKey === "leading_people")!;
    expect(lp.sentences).toHaveLength(2);
    expect(lp.sentences[0]!.accomplishmentIds.sort()).toEqual(["lp1", "lp2"]);
    // EM home claims took em1+em2; leftover em3 (still ≥ cross-fill floor for LP) fills sentence 2
    expect(lp.sentences[1]!.accomplishmentIds).toEqual(["em3"]);

    const em = plan.mpas.find((m) => m.mpaKey === "executing_mission")!;
    expect(em.sentences).toHaveLength(2);
    expect(em.sentences[0]!.accomplishmentIds).toEqual(["em1"]);
    expect(em.sentences[1]!.accomplishmentIds).toEqual(["em2"]);
  });

  it("does not cross-fill with weak relevancy below the floor", () => {
    const plan = assignEpbSentenceGroups([
      record({
        id: "em1",
        action_verb: "Led",
        mpaRelevancy: rel(90, MIN_CROSS_FILL_RELEVANCY - 1),
      }),
      record({
        id: "em2",
        action_verb: "Built",
        mpaRelevancy: rel(85, 10),
      }),
      record({
        id: "em3",
        action_verb: "Directed",
        mpaRelevancy: rel(80, 5),
      }),
    ]);

    expect(plan.mpas.map((m) => m.mpaKey)).toEqual(["executing_mission"]);
    expect(
      plan.mpas.find((m) => m.mpaKey === "executing_mission")!.sentences
    ).toHaveLength(2);
  });

  it("desperately fills a second sentence when stash scores between 25 and 39", () => {
    const plan = assignEpbSentenceGroups([
      record({
        id: "lp1",
        taggedMpa: "leading_people",
        action_verb: "Mentored",
        primaryMpa: "leading_people",
        mpaRelevancy: rel(20, 80),
      }),
      record({
        id: "em1",
        action_verb: "Led",
        mpaRelevancy: rel(95, 20),
      }),
      record({
        id: "em2",
        action_verb: "Built",
        mpaRelevancy: rel(90, 20),
      }),
      record({
        id: "em3",
        action_verb: "Directed",
        mpaRelevancy: rel(70, 35), // below normal floor, above desperate
      }),
    ]);

    const lp = plan.mpas.find((m) => m.mpaKey === "leading_people")!;
    expect(lp.sentences).toHaveLength(2);
    expect(lp.sentences[0]!.accomplishmentIds).toEqual(["lp1"]);
    expect(lp.sentences[1]!.accomplishmentIds).toEqual(["em3"]);
  });

  it("uses each accomplishment at most once", () => {
    const plan = assignEpbSentenceGroups([
      record({ id: "a", action_verb: "Led", mpaRelevancy: rel(90, 88) }),
      record({ id: "b", action_verb: "Built", mpaRelevancy: rel(70, 65) }),
      record({ id: "c", action_verb: "Drove", mpaRelevancy: rel(60, 55) }),
      record({
        id: "d",
        taggedMpa: "leading_people",
        action_verb: "Coached",
        mpaRelevancy: rel(40, 80),
      }),
    ]);
    const allIds = plan.mpas.flatMap((m) =>
      m.sentences.flatMap((s) => s.accomplishmentIds)
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
