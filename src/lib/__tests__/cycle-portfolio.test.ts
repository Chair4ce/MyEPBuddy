import { describe, expect, it } from "vitest";
import {
  ACA_PORTFOLIO_MPA_KEYS,
  buildCyclePortfolio,
  PORTFOLIO_MISFILE_GAP,
} from "../cycle-portfolio";
import type {
  Accomplishment,
  AccomplishmentAssessmentScores,
} from "@/types/database";

function makeScores(
  overrides: Partial<AccomplishmentAssessmentScores> = {}
): AccomplishmentAssessmentScores {
  return {
    mpa_relevancy: {
      executing_mission: 80,
      leading_people: 80,
      managing_resources: 80,
      improving_unit: 80,
      ...overrides.mpa_relevancy,
    },
    overall_score: 85,
    quality_indicators: {
      action_clarity: 85,
      impact_significance: 85,
      metrics_quality: 85,
      scope_definition: 85,
      ...overrides.quality_indicators,
    },
    primary_mpa: "executing_mission",
    secondary_mpa: null,
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<Accomplishment> & Pick<Accomplishment, "mpa">
): Accomplishment {
  const { mpa, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    created_by: "user-1",
    team_member_id: null,
    date: "2026-01-15",
    action_verb: "Led",
    details: "Test details",
    impact: "Test impact",
    metrics: "100%",
    mpa,
    tags: [],
    cycle_year: 2026,
    assessment_scores: null,
    assessed_at: null,
    assessment_model: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    ...rest,
  };
}

const SECOND_PERSON_PATTERN = /\b(your|you|my)\b/i;

function assertRateeNeutralCopy(lines: string[]) {
  for (const line of lines) {
    expect(line).not.toMatch(SECOND_PERSON_PATTERN);
  }
}

describe("buildCyclePortfolio", () => {
  it("returns empty portfolio without solid coverage line", () => {
    const portfolio = buildCyclePortfolio([]);

    expect(portfolio.hasAnyAssessments).toBe(false);
    expect(portfolio.fingerprint.assessedEntryCount).toBe(0);
    expect(portfolio.coachingLines).not.toContain(
      "Solid MPA coverage — keep logging quantified wins through closeout."
    );
    assertRateeNeutralCopy(portfolio.coachingLines);

    for (const key of ACA_PORTFOLIO_MPA_KEYS) {
      expect(portfolio.mpaStats[key].entryCount).toBe(0);
    }
  });

  it("counts volume without assessments", () => {
    const entries = [
      makeEntry({ mpa: "executing_mission" }),
      makeEntry({ mpa: "leading_people" }),
    ];

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.hasAnyAssessments).toBe(false);
    expect(portfolio.fingerprint.assessedEntryCount).toBe(0);
    expect(portfolio.mpaStats.executing_mission.entryCount).toBe(1);
    expect(portfolio.mpaStats.leading_people.entryCount).toBe(1);
    assertRateeNeutralCopy(portfolio.coachingLines);
  });

  it("marks four strong assessed MPAs quality-ready with solid coverage line", () => {
    const entries = ACA_PORTFOLIO_MPA_KEYS.map((mpa) =>
      makeEntry({
        mpa,
        assessment_scores: makeScores({
          primary_mpa: mpa,
          overall_score: 90,
          quality_indicators: {
            action_clarity: 90,
            impact_significance: 90,
            metrics_quality: 90,
            scope_definition: 90,
          },
        }),
      })
    );

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.qualityReadyMpas).toBe(4);
    expect(portfolio.coachingLines).toContain(
      "Solid MPA coverage — keep logging quantified wins through closeout."
    );
    assertRateeNeutralCopy(portfolio.coachingLines);
  });

  it("does not mark high-overall low-metrics MPAs as quality-ready", () => {
    const entries = ACA_PORTFOLIO_MPA_KEYS.map((mpa) =>
      makeEntry({
        mpa,
        assessment_scores: makeScores({
          primary_mpa: mpa,
          overall_score: 90,
          quality_indicators: {
            action_clarity: 90,
            impact_significance: 90,
            metrics_quality: 40,
            scope_definition: 90,
          },
        }),
      })
    );

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.qualityReadyMpas).toBe(0);
    for (const key of ACA_PORTFOLIO_MPA_KEYS) {
      expect(portfolio.mpaStats[key].avgOverall).toBe(90);
      expect(portfolio.mpaStats[key].avgMetrics).toBe(40);
    }
  });

  it("surfaces low cycle-wide metrics coaching line", () => {
    const entries = [
      makeEntry({
        mpa: "executing_mission",
        assessment_scores: makeScores({
          primary_mpa: "executing_mission",
          overall_score: 75,
          quality_indicators: {
            action_clarity: 75,
            impact_significance: 75,
            metrics_quality: 40,
            scope_definition: 75,
          },
        }),
      }),
    ];

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.coachingLines).toContain(
      "Cycle-wide metrics are the weak spot (avg 40). Prefer baseline → result numbers."
    );
    assertRateeNeutralCopy(portfolio.coachingLines);
  });

  it("counts misfiled entries at or above the gap threshold", () => {
    const gap = PORTFOLIO_MISFILE_GAP;
    const entries = [
      makeEntry({
        mpa: "executing_mission",
        assessment_scores: makeScores({
          primary_mpa: "leading_people",
          mpa_relevancy: {
            executing_mission: 50,
            leading_people: 50 + gap,
            managing_resources: 60,
            improving_unit: 55,
          },
        }),
      }),
    ];

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.mpaStats.executing_mission.misfiledCount).toBe(1);
    expect(portfolio.coachingLines).toContain(
      "1 entry may be miscategorized — compare AI Best Fit to the tagged MPA."
    );
    assertRateeNeutralCopy(portfolio.coachingLines);
  });

  it("excludes miscellaneous entries from ACA averages", () => {
    const entries = [
      makeEntry({
        mpa: "miscellaneous",
        assessment_scores: makeScores({
          primary_mpa: "miscellaneous" as never,
          overall_score: 20,
          quality_indicators: {
            action_clarity: 20,
            impact_significance: 20,
            metrics_quality: 20,
            scope_definition: 20,
          },
        }),
      }),
      makeEntry({
        mpa: "executing_mission",
        assessment_scores: makeScores({
          primary_mpa: "executing_mission",
          overall_score: 90,
        }),
      }),
    ];

    const portfolio = buildCyclePortfolio(entries);

    expect(portfolio.fingerprint.assessedEntryCount).toBe(1);
    expect(portfolio.fingerprint.avgOverall).toBe(90);
    expect(portfolio.mpaStats.executing_mission.entryCount).toBe(1);

    for (const key of ACA_PORTFOLIO_MPA_KEYS) {
      if (key !== "executing_mission") {
        expect(portfolio.mpaStats[key].entryCount).toBe(0);
      }
    }
  });

  it("keeps coaching copy ratee-neutral across representative portfolios", () => {
    const portfolios = [
      buildCyclePortfolio([]),
      buildCyclePortfolio([makeEntry({ mpa: "executing_mission" })]),
      buildCyclePortfolio([
        makeEntry({
          mpa: "leading_people",
          assessment_scores: makeScores({
            primary_mpa: "leading_people",
            overall_score: 45,
            quality_indicators: {
              action_clarity: 45,
              impact_significance: 45,
              metrics_quality: 45,
              scope_definition: 45,
            },
          }),
        }),
      ]),
    ];

    for (const portfolio of portfolios) {
      assertRateeNeutralCopy(portfolio.coachingLines);
    }
  });
});
