import { describe, it, expect } from "vitest";
import {
  chunkForPlanning,
  mergeChunkPlans,
  sanitizePlan,
  toPlanRecord,
  trimMergedPlan,
  PLAN_FIELD_MAX_CHARS,
  type EpbPlan,
} from "../plan-epb";
import { buildPlanEpbPrompt } from "../plan-epb-prompt";
import type { Accomplishment } from "@/types/database";

function acc(overrides: Partial<Accomplishment> = {}): Accomplishment {
  return {
    id: "a1",
    user_id: "u1",
    created_by: "u1",
    team_member_id: null,
    date: "2026-03-01",
    action_verb: "Led",
    details: "did a thing",
    impact: "improved things",
    metrics: "10%",
    mpa: "executing_mission",
    tags: [],
    cycle_year: 2026,
    assessment_scores: null,
    assessed_at: null,
    assessment_model: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toPlanRecord", () => {
  it("maps fields and truncates long free text", () => {
    const long = "x".repeat(PLAN_FIELD_MAX_CHARS + 50);
    const rec = toPlanRecord(acc({ details: long }));
    expect(rec.details.endsWith("…")).toBe(true);
    expect(rec.details.length).toBe(PLAN_FIELD_MAX_CHARS + 1);
    expect(rec.action_verb).toBe("Led");
  });

  it("prefers composed stewardship impact and surfaces scores", () => {
    const rec = toPlanRecord(
      acc({
        impact: "plain",
        stewardship_impact: { money: "$5k saved" },
        assessment_scores: {
          overall_score: 88,
          primary_mpa: "leading_people",
          secondary_mpa: null,
          mpa_relevancy: {
            executing_mission: 40,
            leading_people: 88,
            managing_resources: 20,
            improving_unit: 15,
          },
          quality_indicators: {
            action_clarity: 80,
            impact_significance: 80,
            metrics_quality: 80,
            scope_definition: 80,
          },
        },
      })
    );
    expect(rec.impact).toContain("$5k saved");
    expect(rec.overallScore).toBe(88);
    expect(rec.primaryMpa).toBe("leading_people");
  });
});

describe("chunkForPlanning", () => {
  it("splits into bounded chunks", () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    expect(chunkForPlanning(items, 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6],
    ]);
  });
});

describe("sanitizePlan", () => {
  const valid = new Set(["a", "b", "c"]);

  it("drops unknown ids, empty groups, and non-core MPAs; caps at 2 sentences", () => {
    const raw = {
      mpas: [
        {
          mpaKey: "executing_mission",
          sentences: [
            { accomplishmentIds: ["a", "zzz", "a"], rationale: "combine" },
            { accomplishmentIds: ["b"], rationale: "solo" },
            { accomplishmentIds: ["c"], rationale: "third dropped" },
          ],
        },
        { mpaKey: "miscellaneous", sentences: [{ accomplishmentIds: ["c"] }] },
        { mpaKey: "leading_people", sentences: [{ accomplishmentIds: ["zzz"] }] },
      ],
    };
    const plan = sanitizePlan(raw, valid);
    expect(plan.mpas).toHaveLength(1);
    const em = plan.mpas[0];
    expect(em.mpaKey).toBe("executing_mission");
    expect(em.sentences).toHaveLength(2);
    expect(em.sentences[0].accomplishmentIds).toEqual(["a"]); // dedup + drop unknown
  });

  it("returns empty plan for malformed input", () => {
    expect(sanitizePlan(null, valid)).toEqual({ mpas: [] });
    expect(sanitizePlan({ mpas: "nope" }, valid)).toEqual({ mpas: [] });
  });
});

describe("mergeChunkPlans + trimMergedPlan", () => {
  it("concatenates per MPA then trims to strongest 2 groups", () => {
    const plans: EpbPlan[] = [
      {
        mpas: [
          {
            mpaKey: "executing_mission",
            sentences: [{ accomplishmentIds: ["a"], rationale: "" }],
          },
        ],
      },
      {
        mpas: [
          {
            mpaKey: "executing_mission",
            sentences: [
              { accomplishmentIds: ["b"], rationale: "" },
              { accomplishmentIds: ["c"], rationale: "" },
            ],
          },
        ],
      },
    ];
    const merged = mergeChunkPlans(plans);
    expect(merged.mpas[0].sentences).toHaveLength(3);

    const scoreById = new Map([
      ["a", 90],
      ["b", 30],
      ["c", 70],
    ]);
    const trimmed = trimMergedPlan(merged, scoreById, 2);
    const ids = trimmed.mpas[0].sentences.map((s) => s.accomplishmentIds[0]);
    expect(ids).toEqual(["a", "c"]); // highest scores kept, "b" dropped
  });
});

describe("buildPlanEpbPrompt", () => {
  it("includes ids, rank tier guidance, and strict JSON instructions", () => {
    const prompt = buildPlanEpbPrompt({
      records: [toPlanRecord(acc({ id: "a1" }))],
      rateeRank: "MSgt",
      rateeAfsc: "3D0X2",
    });
    expect(prompt).toContain("id: a1");
    expect(prompt).toContain("AF Form 932"); // senior tier note
    expect(prompt).toContain('"mpaKey"');
    expect(prompt).toContain("STRICT JSON");
  });
});
