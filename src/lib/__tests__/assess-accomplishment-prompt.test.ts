import { describe, expect, it } from "vitest";
import { buildAccomplishmentAssessmentPrompt } from "@/lib/assess-accomplishment-prompt";

describe("buildAccomplishmentAssessmentPrompt", () => {
  it("includes stewardship block when fields are set", () => {
    const prompt = buildAccomplishmentAssessmentPrompt(
      {
        action_verb: "Led",
        details: "cyber patch sprint",
        impact: null,
        metrics: "15%",
        mpa: "managing_resources",
        stewardship_impact: {
          time: "40 man-hrs for the flight",
          money: "$12K cost avoidance",
        },
      },
      "SSgt"
    );
    expect(prompt).toContain("Stewardship impact");
    expect(prompt).toContain("Man-hours: 40 man-hrs for the flight");
    expect(prompt).toContain("Funds / cost avoidance: $12K cost avoidance");
    expect(prompt).toContain("AF STEWARDSHIP CONTEXT");
    expect(prompt).toContain("Managing Resources");
    expect(prompt).toContain("Metrics: 15%");
    expect(prompt).not.toContain("Impact: null");
  });

  it("falls back to legacy impact when stewardship empty", () => {
    const prompt = buildAccomplishmentAssessmentPrompt(
      {
        action_verb: "Fixed",
        details: "radio",
        impact: "restored comms for the sq",
        metrics: null,
        mpa: "executing_mission",
        stewardship_impact: {},
      },
      "SrA"
    );
    expect(prompt).toContain("Impact: restored comms for the sq");
    expect(prompt).not.toContain("Stewardship impact (AF Managing Resources):");
  });
});
