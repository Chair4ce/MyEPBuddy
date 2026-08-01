import { describe, expect, it } from "vitest";
import {
  STEWARDSHIP_ASSESSMENT_CRITERIA,
  STEWARDSHIP_HINTS,
  STEWARDSHIP_PLACEHOLDERS,
  TIME_COMPRESSION_WRITING_GUIDANCE,
  composeImpactString,
  formatStewardshipImpactForPrompt,
  hasStewardshipImpactContent,
  hydrateStewardshipImpact,
  normalizeStewardshipImpact,
} from "@/lib/stewardship-impact";

describe("normalizeStewardshipImpact", () => {
  it("returns empty for garbage", () => {
    expect(normalizeStewardshipImpact(null)).toEqual({});
    expect(normalizeStewardshipImpact([])).toEqual({});
    expect(normalizeStewardshipImpact("x")).toEqual({});
  });

  it("keeps non-empty fields and clamps", () => {
    const n = normalizeStewardshipImpact({
      time: "  40 man-hrs  ",
      money: "",
      resources: "x".repeat(600),
      bogus: "nope",
    });
    expect(n.time).toBe("40 man-hrs");
    expect(n.money).toBeUndefined();
    expect(n.resources?.length).toBe(500);
  });
});

describe("composeImpactString / hydrate", () => {
  it("composes labeled legacy impact text", () => {
    expect(
      composeImpactString({
        time: "40 man-hrs",
        money: "$12K avoided",
        outcome: "sortie gen",
      })
    ).toBe(
      "Man-hours: 40 man-hrs | Funds: $12K avoided | Outcome: sortie gen"
    );
    expect(composeImpactString({})).toBeNull();
  });

  it("hydrates legacy impact into outcome when stewardship empty", () => {
    expect(hydrateStewardshipImpact({}, "saved readiness")).toEqual({
      outcome: "saved readiness",
    });
    expect(
      hydrateStewardshipImpact({ time: "10 hrs" }, "ignored legacy")
    ).toEqual({ time: "10 hrs" });
  });
});

describe("formatStewardshipImpactForPrompt", () => {
  it("emits stewardship block when fields set", () => {
    const text = formatStewardshipImpactForPrompt(
      { time: "40 man-hrs", money: "$5K" },
      "legacy",
      "15%"
    );
    expect(text).toContain("Stewardship impact");
    expect(text).toContain("Man-hours: 40 man-hrs");
    expect(text).toContain("Funds / cost avoidance: $5K");
    expect(text).not.toContain("Impact: legacy");
    expect(text).toContain("Metrics: 15%");
  });

  it("falls back to legacy impact when stewardship empty", () => {
    const text = formatStewardshipImpactForPrompt({}, "unit readiness up", null);
    expect(text).toContain("Impact: unit readiness up");
    expect(text).not.toContain("Stewardship impact");
  });

  it("hasStewardshipImpactContent detects any lever", () => {
    expect(hasStewardshipImpactContent({})).toBe(false);
    expect(hasStewardshipImpactContent({ resources: "2 SMEs" })).toBe(true);
  });
});

describe("ahead-of-schedule guidance", () => {
  it("keeps Man-hours placeholder short; detail lives in the hover hint", () => {
    expect(STEWARDSHIP_PLACEHOLDERS.time.length).toBeLessThan(40);
    expect(STEWARDSHIP_PLACEHOLDERS.time).toMatch(/early|man-hrs/i);
    expect(STEWARDSHIP_HINTS.time).toMatch(/Baseline → actual/i);
    expect(STEWARDSHIP_HINTS.time).toMatch(/mos\/wks\/days\/hrs/);
  });

  it("scores early/% faster above on-time in assessment criteria", () => {
    expect(STEWARDSHIP_ASSESSMENT_CRITERIA).toContain(
      "Ahead-of-schedule vs on-time"
    );
    expect(STEWARDSHIP_ASSESSMENT_CRITERIA).toMatch(/ON TIME/i);
    expect(STEWARDSHIP_ASSESSMENT_CRITERIA).toMatch(/EARLY|% faster/i);
  });

  it("requires generate/revise to quantify time compression when supported", () => {
    expect(TIME_COMPRESSION_WRITING_GUIDANCE).toContain(
      "TIME COMPRESSION / AHEAD OF SCHEDULE"
    );
    expect(TIME_COMPRESSION_WRITING_GUIDANCE).toMatch(/Never invent a baseline/i);
    expect(TIME_COMPRESSION_WRITING_GUIDANCE).toMatch(/45%|3 mos early/i);
  });
});
