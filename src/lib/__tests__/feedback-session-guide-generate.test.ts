import { describe, expect, it } from "vitest";
import {
  buildFinalGuideGeneratePrompt,
  buildGuideGenerateUserPrompt,
  buildMidtermGuideGeneratePrompt,
  FEEDBACK_FINAL_GENERATE_GUARDRAILS,
  FEEDBACK_MIDTERM_GENERATE_GUARDRAILS,
  FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS,
  getGenerateGuardrailsForType,
} from "../feedback-session-guide-generate";
import type { CycleAcaStrengthsWeaknesses } from "../feedback-aca-strengths-weaknesses";
import type { AccomplishmentsSummary } from "../feedback-talking-points";

const summary = {
  topByMpa: {
    executing_mission: [
      {
        id: "a1",
        mpa: "executing_mission",
        label: "EM",
        overallScore: 88,
        summary: "Led: Led shop readiness drill — overall 88",
      },
    ],
  },
  lowestScored: [],
  unassessedCount: 0,
  unassessedThinMpaVerbs: [],
  fullDetailEntries: [
    {
      id: "a1",
      mpa: "executing_mission",
      label: "EM",
      overallScore: 88,
      summary: "Led: Led shop readiness drill — overall 88",
    },
  ],
  reviewedAccomplishmentIds: ["a1"],
} satisfies AccomplishmentsSummary;

const acaStrengthsWeaknesses = {
  formLabel: "AF Form 931",
  strengths: [
    {
      id: "a1",
      date: "2026-01-01",
      actionVerb: "Led",
      summary: "Led — Led shop readiness drill",
      mpaLabel: "Executing the Mission",
      overallScore: 88,
      proficiencyLabel: "Far Exceeds",
      weakestIndicatorLabel: null,
    },
  ],
  weaknesses: [],
  unassessedCount: 0,
  assessedCount: 1,
} satisfies CycleAcaStrengthsWeaknesses;

const midtermBase = {
  rateeRank: "TSgt" as const,
  rateeName: "Jones",
  sessionSettings: "## Performance assessment\n- Tentative focus",
  accomplishmentsSummary: summary,
  acaStrengthsWeaknesses,
  unassessedIncludedCount: 0,
};

const finalBase = {
  rateeRank: "TSgt" as const,
  rateeName: "Jones",
  sessionSettings: "## Purpose 1 — Review the reporting period & EPB",
  epbStatements: [
    {
      mpa: "executing_mission",
      text: "Delivered mission critical network support sustaining 99.8% availability",
    },
  ],
};

describe("feedback session guide generate prompts", () => {
  it("includes shared generate guardrails", () => {
    expect(FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS).toContain(
      "outline brief"
    );
    expect(FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS).toContain(
      "Do NOT predict promotion"
    );
  });

  it("splits midterm vs final source-of-truth guardrails", () => {
    expect(FEEDBACK_MIDTERM_GENERATE_GUARDRAILS).toContain(
      "assessed cycle accomplishments"
    );
    expect(FEEDBACK_FINAL_GENERATE_GUARDRAILS).toContain(
      "EPB/EPR MPA statements"
    );
    expect(FEEDBACK_FINAL_GENERATE_GUARDRAILS).toContain(
      "NOT the accomplishments list"
    );
    expect(getGenerateGuardrailsForType("final")).toBe(
      FEEDBACK_FINAL_GENERATE_GUARDRAILS
    );
  });

  it("Midterm generate marries settings with ACA strengths/weaknesses", () => {
    const prompt = buildMidtermGuideGeneratePrompt({
      ...midtermBase,
      feedbackType: "midterm",
    });
    expect(prompt).toContain("GENERATE Midterm");
    expect(prompt).toContain("<<<SETTINGS>>>");
    expect(prompt).toContain("Performance assessment");
    expect(prompt).toContain("## Strengths");
    expect(prompt).toContain("Far Exceeds");
    expect(prompt).toContain("Led shop readiness drill");
    expect(prompt).toContain("Strengths:");
    expect(prompt).toContain("Weaknesses:");
    expect(prompt).toContain("Does Not Meet | Meets | Exceeds | Far Exceeds");
    expect(prompt).not.toContain("FORMAT Midterm ACA session settings");
  });

  it("Final generate is EPB-primary and omits accomplishments", () => {
    const prompt = buildFinalGuideGeneratePrompt({
      ...finalBase,
      feedbackType: "final",
    });
    expect(prompt).toContain("GENERATE Final");
    expect(prompt).toContain("PRIMARY SOURCE = EPB");
    expect(prompt).toContain("new reporting period");
    expect(prompt).toContain("<<<EPB>>>");
    expect(prompt).toContain("Delivered mission critical network support");
    expect(prompt).not.toContain("Led shop readiness drill");
    expect(prompt).not.toContain("## Strengths");
    expect(prompt).not.toContain("serializeAccomplishments");
  });

  it("Final generate notes unavailable EPB without falling back to accomplishments", () => {
    const prompt = buildFinalGuideGeneratePrompt({
      ...finalBase,
      feedbackType: "final",
      epbStatements: null,
    });
    expect(prompt).toContain("EPB statements unavailable");
    expect(prompt).not.toContain("Led shop readiness drill");
  });

  it("routes by feedback type", () => {
    expect(
      buildGuideGenerateUserPrompt({ ...midtermBase, feedbackType: "midterm" })
    ).toContain("GENERATE Midterm");
    expect(
      buildGuideGenerateUserPrompt({ ...finalBase, feedbackType: "final" })
    ).toContain("GENERATE Final");
  });

  it("notes unassessed cycle entries for Midterm", () => {
    const prompt = buildMidtermGuideGeneratePrompt({
      ...midtermBase,
      feedbackType: "midterm",
      unassessedIncludedCount: 2,
    });
    expect(prompt).toContain(
      "2 cycle accomplishment(s) lack AI assessments"
    );
  });
});
