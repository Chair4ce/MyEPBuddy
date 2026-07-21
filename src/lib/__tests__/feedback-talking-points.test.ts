import { describe, expect, it } from "vitest";
import {
  buildAccomplishmentsSummary,
  buildTalkingPointsUserPrompt,
  FEEDBACK_TALKING_POINTS_GUARDRAILS,
  formatTalkingPointsDraft,
  isFeedbackType,
  PROMPT_CHAR_BUDGET,
  truncatePromptText,
  type TalkingPointsDraft,
} from "../feedback-talking-points";
import { ACA_PORTFOLIO_MPA_KEYS, buildCyclePortfolio } from "../cycle-portfolio";
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

describe("formatTalkingPointsDraft", () => {
  it("produces expected section headings", () => {
    const draft: TalkingPointsDraft = {
      feedbackType: "midterm",
      headline: "Review progress against expectations",
      sections: [
        {
          title: "Strengths to recognize",
          bullets: ["Strong mission execution"],
        },
        {
          title: "Gaps / risks",
          bullets: ["Metrics thin on two entries"],
        },
      ],
      suggestedAsks: ["Add quantified closeout wins"],
      evidenceRefs: ["EM: Led project — overall 82"],
    };

    const text = formatTalkingPointsDraft(draft);

    expect(text).toContain("## Session focus");
    expect(text).toContain("Review progress against expectations");
    expect(text).toContain("## Strengths to recognize");
    expect(text).toContain("- Strong mission execution");
    expect(text).toContain("## Gaps / risks");
    expect(text).toContain("## Developmental asks");
    expect(text).toContain("- Add quantified closeout wins");
    expect(text).toContain("## Evidence to have handy");
    expect(text).toContain("- EM: Led project — overall 82");
  });
});

describe("buildTalkingPointsUserPrompt", () => {
  const portfolio = buildCyclePortfolio([
    makeEntry({
      mpa: "executing_mission",
      assessment_scores: makeScores({ overall_score: 90 }),
    }),
  ]);

  const accomplishmentsSummary = buildAccomplishmentsSummary(
    [
      makeEntry({
        mpa: "executing_mission",
        assessment_scores: makeScores({ overall_score: 90 }),
      }),
    ],
    portfolio
  );

  it("includes expectations and ACA mention for initial feedback", () => {
    const prompt = buildTalkingPointsUserPrompt({
      feedbackType: "initial",
      ratee: { rank: "SSgt", name: "Jane Doe" },
      expectations: "Lead the shop upgrade with measurable milestones.",
      portfolio,
      accomplishmentsSummary,
    });

    expect(prompt).toContain("INITIAL feedback session");
    expect(prompt).toContain("Lead the shop upgrade");
    expect(prompt).toContain("ACA rubric");
    expect(prompt).toContain("AF Form 931");
    expect(prompt).not.toContain("Cycle portfolio summary");
  });

  it("includes portfolio and accomplishments for midterm feedback", () => {
    const manyEntries = Array.from({ length: 15 }, (_, index) =>
      makeEntry({
        mpa: ACA_PORTFOLIO_MPA_KEYS[index % 4],
        action_verb: `Action ${index}`,
        assessment_scores: makeScores({ overall_score: 70 + index }),
      })
    );
    const largePortfolio = buildCyclePortfolio(manyEntries);
    const largeSummary = buildAccomplishmentsSummary(manyEntries, largePortfolio);

    const prompt = buildTalkingPointsUserPrompt({
      feedbackType: "midterm",
      ratee: { rank: "SSgt", name: "Jane Doe" },
      expectations: "Maintain mission readiness.",
      portfolio: largePortfolio,
      accomplishmentsSummary: largeSummary,
    });

    expect(prompt).toContain("MIDTERM review");
    expect(prompt).toContain("Cycle portfolio summary");
    expect(prompt).toContain("Accomplishment evidence");
    expect(prompt).toContain("Top entries per MPA");
  });
});

describe("truncatePromptText", () => {
  it("keeps prompt under documented char budget when truncated", () => {
    const longText = "A".repeat(PROMPT_CHAR_BUDGET + 5000);
    const { text, truncated } = truncatePromptText(longText, PROMPT_CHAR_BUDGET);

    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET);
    expect(text).toContain("[... truncated for length ...]");
  });
});

describe("guardrails", () => {
  it("does not claim promotion or stratification prediction capabilities", () => {
    const positiveCapabilityClaims =
      /(?:^|[^NOT ])(?:will|likely to|can|helps you|use this to).{0,30}(?:promot|stratif|forced distribution)/i;
    for (const line of FEEDBACK_TALKING_POINTS_GUARDRAILS.split("\n")) {
      expect(line).not.toMatch(positiveCapabilityClaims);
    }
    expect(FEEDBACK_TALKING_POINTS_GUARDRAILS).toContain("Do NOT predict");
    expect(FEEDBACK_TALKING_POINTS_GUARDRAILS).toContain("EFDP discussion prep");
  });
});

describe("isFeedbackType", () => {
  it("accepts initial, midterm, and final only", () => {
    expect(isFeedbackType("initial")).toBe(true);
    expect(isFeedbackType("midterm")).toBe(true);
    expect(isFeedbackType("final")).toBe(true);
    expect(isFeedbackType("efdp")).toBe(false);
    expect(isFeedbackType("")).toBe(false);
    expect(isFeedbackType(null)).toBe(false);
  });
});
