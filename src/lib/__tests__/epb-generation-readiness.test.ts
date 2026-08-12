import { describe, it, expect } from "vitest";
import {
  entriesNeedingAssessment,
  evaluateEpbGenerationReadiness,
  getMpasWithExistingStatements,
  MIN_ELIGIBLE_MPAS,
  MIN_TOTAL_ACA_ENTRIES,
} from "../epb-generation-readiness";
import type {
  Accomplishment,
  AccomplishmentAssessmentScores,
} from "@/types/database";

function scores(
  overall: number,
  primaryMpa: string
): AccomplishmentAssessmentScores {
  return {
    overall_score: overall,
    primary_mpa: primaryMpa,
    secondary_mpa: null,
    mpa_relevancy: {
      executing_mission: primaryMpa === "executing_mission" ? overall : 20,
      leading_people: primaryMpa === "leading_people" ? overall : 20,
      managing_resources: primaryMpa === "managing_resources" ? overall : 20,
      improving_unit: primaryMpa === "improving_unit" ? overall : 20,
    },
    quality_indicators: {
      action_clarity: overall,
      impact_significance: overall,
      metrics_quality: overall,
      scope_definition: overall,
    },
  };
}

let idCounter = 0;
function entry(overrides: Partial<Accomplishment> = {}): Accomplishment {
  idCounter += 1;
  const base: Accomplishment = {
    id: `acc-${idCounter}`,
    user_id: "u1",
    created_by: "u1",
    team_member_id: null,
    date: "2026-03-01",
    action_verb: "Led",
    details: "did a thing",
    impact: "improved things",
    metrics: null,
    mpa: "executing_mission",
    tags: [],
    cycle_year: 2026,
    assessment_scores: null,
    assessed_at: null,
    assessment_model: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function assessed(
  mpa: string,
  overall: number,
  overrides: Partial<Accomplishment> = {}
): Accomplishment {
  return entry({
    mpa,
    assessment_scores: scores(overall, mpa),
    assessed_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("evaluateEpbGenerationReadiness", () => {
  it("blocks when there are too few entries", () => {
    const result = evaluateEpbGenerationReadiness([
      assessed("executing_mission", 80),
    ]);
    expect(result.canGenerate).toBe(false);
    expect(result.reasons.join(" ")).toContain(
      `at least ${MIN_TOTAL_ACA_ENTRIES}`
    );
  });

  it("allows a single labeled MPA when enough entries exist for cross-fill", () => {
    const result = evaluateEpbGenerationReadiness([
      assessed("executing_mission", 80),
      assessed("executing_mission", 75),
      assessed("executing_mission", 70),
    ]);
    expect(result.canGenerate).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/No entries tagged/i);
    // Compatibility export still documents the floor, but labeled multi-MPA
    // coverage is no longer a hard gate (MIN_ELIGIBLE_MPAS === 1).
    expect(MIN_ELIGIBLE_MPAS).toBe(1);
  });

  it("allows generation with coverage across MPAs", () => {
    const result = evaluateEpbGenerationReadiness([
      assessed("executing_mission", 80),
      assessed("executing_mission", 78),
      assessed("leading_people", 72),
    ]);
    expect(result.canGenerate).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.eligibleMpaKeys).toEqual(
      expect.arrayContaining(["executing_mission", "leading_people"])
    );
  });

  it("gates non-enlisted ratees when a rank is provided", () => {
    const entries = [
      assessed("executing_mission", 80),
      assessed("leading_people", 78),
      assessed("managing_resources", 72),
    ];
    expect(
      evaluateEpbGenerationReadiness(entries, { rank: "Civilian" }).canGenerate
    ).toBe(false);
    expect(
      evaluateEpbGenerationReadiness(entries, { rank: "SSgt" }).canGenerate
    ).toBe(true);
  });

  it("warns about empty MPAs without blocking; tracks unassessed/stale counts", () => {
    const result = evaluateEpbGenerationReadiness([
      assessed("executing_mission", 80),
      assessed("leading_people", 78),
      // unassessed
      entry({ mpa: "managing_resources" }),
      // stale: edited well after assessment
      assessed("executing_mission", 65, {
        assessed_at: "2026-03-02T00:00:00.000Z",
        updated_at: "2026-03-05T00:00:00.000Z",
      }),
    ]);

    expect(result.canGenerate).toBe(true);
    expect(result.unassessedCount).toBe(1);
    expect(result.staleCount).toBe(1);
    const warningText = result.warnings.join(" ");
    expect(warningText).toContain("Improving the Unit"); // empty MPA
    expect(warningText).not.toContain("no AI assessment");
    expect(warningText).not.toContain("edited after assessment");
  });

  it("lists ACA entries that need a fresh assessment", () => {
    const fresh = assessed("executing_mission", 80);
    const missing = entry({ mpa: "managing_resources" });
    const stale = assessed("leading_people", 65, {
      assessed_at: "2026-03-02T00:00:00.000Z",
      updated_at: "2026-03-05T00:00:00.000Z",
    });
    expect(entriesNeedingAssessment([fresh, missing, stale])).toEqual([
      missing.id,
      stale.id,
    ]);
  });

  it("marks per-MPA strength using the portfolio quality floor", () => {
    const result = evaluateEpbGenerationReadiness([
      assessed("executing_mission", 85),
      assessed("executing_mission", 82),
      assessed("leading_people", 40),
    ]);
    expect(result.perMpa.executing_mission.isStrong).toBe(true);
    expect(result.perMpa.leading_people.isStrong).toBe(false);
    expect(result.perMpa.improving_unit.hasContent).toBe(false);
  });
});

describe("getMpasWithExistingStatements", () => {
  it("returns only MPAs whose section holds a substantial statement", () => {
    const result = getMpasWithExistingStatements([
      {
        mpa: "executing_mission",
        statement_text:
          "Spearheaded a squadron-wide migration effort improving readiness across the unit.",
      },
      { mpa: "leading_people", statement_text: "" },
      { mpa: "managing_resources", statement_text: "x" },
    ]);
    expect(result).toEqual(["executing_mission"]);
  });
});
