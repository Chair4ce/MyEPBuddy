import { describe, expect, it } from "vitest";
import {
  getAssessmentChrome,
  getAssessmentCoachingTips,
  INDICATOR_WEAK_THRESHOLD,
  isAssessmentStale,
} from "../assessment-coaching";
import { PORTFOLIO_MISFILE_GAP } from "../cycle-portfolio";
import type { AccomplishmentAssessmentScores } from "@/types/database";

const SECOND_PERSON_PATTERN = /\b(you|your|my)\b/i;

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

function assertRateeNeutralCopy(tips: ReturnType<typeof getAssessmentCoachingTips>) {
  for (const tip of tips) {
    expect(`${tip.title} ${tip.body}`).not.toMatch(SECOND_PERSON_PATTERN);
  }
}

describe("getAssessmentCoachingTips", () => {
  it("returns strong tip alone when all indicators meet threshold and no misfile", () => {
    const tips = getAssessmentCoachingTips(makeScores(), "executing_mission");

    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({
      id: "strong",
      title: "Ready for the package",
      body: "Quality indicators clear the bar. Keep numbers tight when drafting the EPB statement from this entry.",
      severity: "strong",
    });
    assertRateeNeutralCopy(tips);
  });

  it("returns weak tips ordered by ascending score with exact bodies", () => {
    const tips = getAssessmentCoachingTips(
      makeScores({
        quality_indicators: {
          action_clarity: 55,
          impact_significance: 40,
          metrics_quality: 50,
          scope_definition: 85,
        },
      }),
      "executing_mission"
    );

    expect(tips.map((t) => t.id)).toEqual([
      "impact_significance",
      "metrics_quality",
      "action_clarity",
    ]);
    expect(tips[0].body).toBe(
      "Spell out who benefited and what changed (section, unit, or mission outcome) — not only that the task was finished."
    );
    expect(tips[1].body).toBe(
      'Add a baseline → result number (%, count, hours, errors, dollars). Vague "improved" will not carry an EPB bullet.'
    );
    expect(tips[2].body).toBe(
      "Lead with a concrete verb + object. Cut filler so a rater can see exactly what was done in one read."
    );
    assertRateeNeutralCopy(tips);
  });

  it("adds misfile tip after weak tips when relevancy gap meets threshold", () => {
    const tips = getAssessmentCoachingTips(
      makeScores({
        mpa_relevancy: {
          executing_mission: 40,
          leading_people: 40 + PORTFOLIO_MISFILE_GAP,
          managing_resources: 80,
          improving_unit: 80,
        },
        quality_indicators: {
          action_clarity: 50,
          impact_significance: 85,
          metrics_quality: 85,
          scope_definition: 85,
        },
        primary_mpa: "leading_people",
      }),
      "executing_mission"
    );

    expect(tips).toHaveLength(2);
    expect(tips[0].id).toBe("action_clarity");
    expect(tips[1]).toMatchObject({
      id: "misfile",
      title: "MPA fit",
      severity: "info",
    });
    expect(tips[1].body).toBe(
      "AI Best Fit is Leading People, not the selected Executing the Mission. Recategorize if the work truly matches that MPA."
    );
    assertRateeNeutralCopy(tips);
  });

  it("does not add misfile tip when relevancy gap is below threshold", () => {
    const tips = getAssessmentCoachingTips(
      makeScores({
        mpa_relevancy: {
          executing_mission: 40,
          leading_people: 40 + PORTFOLIO_MISFILE_GAP - 1,
          managing_resources: 80,
          improving_unit: 80,
        },
        primary_mpa: "leading_people",
      }),
      "executing_mission"
    );

    expect(tips.some((t) => t.id === "misfile")).toBe(false);
  });

  it("caps tips at four including misfile", () => {
    const tips = getAssessmentCoachingTips(
      makeScores({
        mpa_relevancy: {
          executing_mission: 30,
          leading_people: 30 + PORTFOLIO_MISFILE_GAP,
          managing_resources: 80,
          improving_unit: 80,
        },
        quality_indicators: {
          action_clarity: 30,
          impact_significance: 40,
          metrics_quality: 50,
          scope_definition: 85,
        },
        primary_mpa: "leading_people",
      }),
      "executing_mission"
    );

    expect(tips).toHaveLength(4);
    expect(tips.map((t) => t.id)).toEqual([
      "action_clarity",
      "impact_significance",
      "metrics_quality",
      "misfile",
    ]);
    assertRateeNeutralCopy(tips);
  });

  it("uses weak threshold constant for indicator tips", () => {
    const tips = getAssessmentCoachingTips(
      makeScores({
        quality_indicators: {
          action_clarity: INDICATOR_WEAK_THRESHOLD,
          impact_significance: INDICATOR_WEAK_THRESHOLD - 1,
          metrics_quality: 85,
          scope_definition: 85,
        },
      }),
      "executing_mission"
    );

    expect(tips).toHaveLength(1);
    expect(tips[0].id).toBe("impact_significance");
  });
});

describe("isAssessmentStale", () => {
  it("is false when assessed_at is missing", () => {
    expect(isAssessmentStale(null, "2026-08-01T12:00:00.000Z")).toBe(false);
  });

  it("is false when assessment is current or newer than updated_at", () => {
    expect(
      isAssessmentStale(
        "2026-08-01T12:00:00.000Z",
        "2026-08-01T11:59:00.000Z"
      )
    ).toBe(false);
    expect(
      isAssessmentStale(
        "2026-08-01T12:00:00.000Z",
        "2026-08-01T12:00:01.000Z"
      )
    ).toBe(false);
  });

  it("is true when the entry was updated after assessment", () => {
    expect(
      isAssessmentStale(
        "2026-08-01T12:00:00.000Z",
        "2026-08-01T12:05:00.000Z"
      )
    ).toBe(true);
  });
});

describe("getAssessmentChrome", () => {
  it("returns shared CTA labels for self and rater", () => {
    const selfChrome = getAssessmentChrome("self");
    const raterChrome = getAssessmentChrome("rater");

    expect(selfChrome.ctaLabel).toBe("Assess entry");
    expect(raterChrome.ctaLabel).toBe("Assess entry");
    expect(selfChrome.ctaRelabel).toBe("Re-assess");
    expect(raterChrome.ctaRelabel).toBe("Re-assess");
    expect(selfChrome.sectionLabel).toBe("AI Assessment");
    expect(raterChrome.sectionLabel).toBe("AI Assessment");
  });

  it("returns distinct tipsHeading and emptyHint for self vs rater", () => {
    const selfChrome = getAssessmentChrome("self");
    const raterChrome = getAssessmentChrome("rater");

    expect(selfChrome.tipsHeading).toBe("Improvement notes");
    expect(raterChrome.tipsHeading).toBe("Feedback notes");
    expect(selfChrome.emptyHint).toContain("improvement notes");
    expect(raterChrome.emptyHint).toContain("feedback notes for the ratee");
    expect(selfChrome.emptyHint).not.toBe(raterChrome.emptyHint);
  });
});
