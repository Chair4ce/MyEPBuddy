import { describe, expect, it } from "vitest";
import {
  buildCycleAcaStrengthsWeaknesses,
  scoreToAcaProficiencyLabel,
  serializeAcaStrengthsWeaknesses,
} from "../feedback-aca-strengths-weaknesses";
import type { AccomplishmentAssessmentScores } from "@/types/database";

function scores(overall: number): AccomplishmentAssessmentScores {
  return {
    overall_score: overall,
    mpa_relevancy: {
      executing_mission: overall,
      leading_people: overall,
      managing_resources: overall,
      improving_unit: overall,
    },
    quality_indicators: {
      action_clarity: overall,
      impact_significance: overall,
      metrics_quality: Math.max(0, overall - 20),
      scope_definition: overall,
    },
    primary_mpa: "executing_mission",
    secondary_mpa: null,
  };
}

describe("feedback ACA strengths & weaknesses", () => {
  it("maps overall scores to junior ACA proficiency labels", () => {
    expect(scoreToAcaProficiencyLabel(20, "TSgt")).toBe("Does Not Meet");
    expect(scoreToAcaProficiencyLabel(50, "TSgt")).toBe("Meets");
    expect(scoreToAcaProficiencyLabel(70, "TSgt")).toBe("Exceeds");
    expect(scoreToAcaProficiencyLabel(90, "TSgt")).toBe("Far Exceeds");
  });

  it("maps top band to Significantly Exceeds for seniors", () => {
    expect(scoreToAcaProficiencyLabel(90, "MSgt")).toBe("Significantly Exceeds");
  });

  it("splits strengths (>=61) and weaknesses (<61)", () => {
    const summary = buildCycleAcaStrengthsWeaknesses(
      [
        {
          id: "s1",
          date: "2026-01-01",
          action_verb: "Led",
          details: "Restored network for mission customers",
          mpa: "executing_mission",
          assessment_scores: scores(88),
        },
        {
          id: "w1",
          date: "2026-02-01",
          action_verb: "Documented",
          details: "Incomplete ticket write-up",
          mpa: "leading_people",
          assessment_scores: scores(40),
        },
        {
          id: "u1",
          date: "2026-03-01",
          action_verb: "Supported",
          details: "Help desk overflow",
          mpa: "managing_resources",
          assessment_scores: null,
        },
      ],
      "TSgt"
    );

    expect(summary.formLabel).toBe("AF Form 931");
    expect(summary.strengths).toHaveLength(1);
    expect(summary.strengths[0]?.proficiencyLabel).toBe("Far Exceeds");
    expect(summary.weaknesses).toHaveLength(1);
    expect(summary.weaknesses[0]?.proficiencyLabel).toBe("Meets");
    expect(summary.unassessedCount).toBe(1);
  });

  it("serializes strengths and weaknesses for generate prompts", () => {
    const summary = buildCycleAcaStrengthsWeaknesses(
      [
        {
          id: "s1",
          date: "2026-01-01",
          action_verb: "Led",
          details: "Emergency VLAN restore",
          mpa: "executing_mission",
          assessment_scores: scores(92),
        },
      ],
      "TSgt"
    );
    const text = serializeAcaStrengthsWeaknesses(summary);
    expect(text).toContain("## Strengths");
    expect(text).toContain("Far Exceeds");
    expect(text).toContain("Emergency VLAN restore");
    expect(text).toContain("## Weaknesses");
  });
});
