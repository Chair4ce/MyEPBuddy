import { describe, expect, it } from "vitest";
import {
  buildFinalGuideRevisePrompt,
  buildGuideReviseUserPrompt,
  buildInitialGuideRevisePrompt,
  buildMidtermGuideRevisePrompt,
  FEEDBACK_SESSION_GUIDE_REVISE_GUARDRAILS,
  looksLikePackageReviewGuide,
  sanitizeInitialSessionGuideText,
} from "../feedback-session-guide-revise";
import type { AccomplishmentsSummary } from "../feedback-talking-points";

const base = {
  rateeRank: "TSgt" as const,
  rateeName: "Jones",
  draftText: "- Set clear standards\n- Weekly check-ins",
};

describe("feedback session guide revise prompts", () => {
  it("includes shared guardrails language for private supervisor notes", () => {
    expect(FEEDBACK_SESSION_GUIDE_REVISE_GUARDRAILS).toContain(
      "private Feedback Session Guide"
    );
    expect(FEEDBACK_SESSION_GUIDE_REVISE_GUARDRAILS).toContain(
      "Do NOT predict promotion"
    );
  });

  it("Initial revise formats forward-looking expectations only", () => {
    const prompt = buildInitialGuideRevisePrompt({
      ...base,
      feedbackType: "initial",
    });
    expect(prompt).toContain("INITIAL ACA");
    expect(prompt).toContain("beginning-of-supervision");
    expect(prompt).toContain("NOT a performance review");
    expect(prompt).toContain("Do NOT cite accomplishments");
    expect(prompt).toContain("Evidence to have handy");
    expect(prompt).toContain("Check-in cadence");
    expect(prompt).toContain("<<<DRAFT>>>");
    expect(prompt).toContain("Knowing your Airman");
    expect(prompt).not.toContain("<<<EXPECTATIONS>>>");
    expect(prompt).not.toContain("Cycle portfolio");
    expect(prompt).not.toContain("Accomplishment evidence");
  });

  it("sanitizeInitialSessionGuideText strips package-review dumps before Initial revise", () => {
    const contaminated = `## Session focus
Aligning expectations.

## Strengths to recognize
- Led shop (EXEC: Led — overall 90)

## Gaps / risks
- Need more evidence

## Developmental asks
- Weekly check-ins

## Evidence to have handy
- EXEC: Led — overall 90`;

    expect(looksLikePackageReviewGuide(contaminated)).toBe(true);
    const cleaned = sanitizeInitialSessionGuideText(contaminated);
    expect(cleaned).toContain("Session focus");
    expect(cleaned).toContain("Developmental asks");
    expect(cleaned).toContain("Weekly check-ins");
    expect(cleaned).not.toContain("Strengths to recognize");
    expect(cleaned).not.toContain("Evidence to have handy");
    expect(cleaned).not.toContain("overall 90");
    expect(cleaned).not.toContain("Gaps / risks");

    const prompt = buildInitialGuideRevisePrompt({
      ...base,
      feedbackType: "initial",
      draftText: contaminated,
    });
    const draftStart = prompt.indexOf("<<<DRAFT>>>");
    const draftEnd = prompt.indexOf("<<<END DRAFT>>>");
    const draftBody = prompt.slice(draftStart, draftEnd);
    expect(draftBody).not.toContain("overall 90");
    expect(draftBody).not.toContain("Strengths to recognize");
    expect(draftBody).toContain("Weekly check-ins");
  });

  it("Initial revise via router strips midterm grounding if mistakenly passed", () => {
    const fakeSummary = {
      topByMpa: {},
      lowestScored: [],
      unassessedCount: 0,
      unassessedThinMpaVerbs: [],
      fullDetailEntries: [],
      reviewedAccomplishmentIds: [],
    } satisfies AccomplishmentsSummary;

    const prompt = buildGuideReviseUserPrompt({
      ...base,
      feedbackType: "initial",
      expectations: "Should never appear",
      accomplishmentsSummary: fakeSummary,
      portfolio: null,
    });

    expect(prompt).toContain("INITIAL");
    expect(prompt).not.toContain("Should never appear");
    expect(prompt).not.toContain("Accomplishment evidence");
    expect(prompt).toContain("Do NOT cite accomplishments");
  });

  it("Midterm revise formats settings only without accomplishments", () => {
    const prompt = buildMidtermGuideRevisePrompt({
      ...base,
      feedbackType: "midterm",
      draftText: "",
      expectations: "Meet weekly standards",
      accomplishmentsSummary: {
        topByMpa: {},
        lowestScored: [],
        unassessedCount: 0,
        unassessedThinMpaVerbs: [],
        fullDetailEntries: [],
        reviewedAccomplishmentIds: [],
      },
    });
    expect(prompt).toContain("FORMAT Midterm ACA session settings");
    expect(prompt).toContain("form-prep checklist");
    expect(prompt).toContain("Do NOT cite accomplishments");
    expect(prompt).toContain("empty — return a short blank Midterm");
    expect(prompt).not.toContain("<<<EXPECTATIONS>>>");
    expect(prompt).not.toContain("Accomplishment evidence");
    expect(prompt).not.toContain("Meet weekly standards");
  });

  it("Final revise formats settings only without EPB grounding", () => {
    const prompt = buildFinalGuideRevisePrompt({
      ...base,
      feedbackType: "final",
      epbStatements: [
        { mpa: "executing_mission", text: "Delivered mission critical support" },
      ],
    });
    expect(prompt).toContain("FORMAT Final / End-of-Reporting Period");
    expect(prompt).toContain("form-prep checklist");
    expect(prompt).toContain("Do NOT cite accomplishments");
    expect(prompt).not.toContain("<<<EPB>>>");
    expect(prompt).not.toContain("Delivered mission critical support");
  });

  it("buildGuideReviseUserPrompt routes by feedback type", () => {
    expect(
      buildGuideReviseUserPrompt({ ...base, feedbackType: "initial" })
    ).toContain("INITIAL");
    expect(
      buildGuideReviseUserPrompt({ ...base, feedbackType: "midterm" })
    ).toContain("FORMAT Midterm");
    expect(
      buildGuideReviseUserPrompt({ ...base, feedbackType: "final" })
    ).toContain("FORMAT Final");
  });
});
