import { describe, expect, it } from "vitest";
import {
  AF_STEWARDSHIP_IMPACT_BRIEF,
  DEFAULT_IMPACT_BOOSTER_PROMPTS,
  EMPTY_IMPACT_BOOSTER,
  buildImpactBoosterContext,
  clearedImpactBooster,
  hasImpactBoosterContent,
  impactStrengthBand,
  impactStrengthLabel,
  mergeImpactAssessment,
  normalizeImpactBooster,
  parseImpactAssessment,
  removeImpactBoosterAnswer,
  setImpactBoosterFreeform,
  upsertImpactBoosterAnswer,
} from "@/lib/impact-booster";
import type { ImpactBoosterState } from "@/types/database";

describe("impactStrengthBand", () => {
  it("maps bands correctly", () => {
    expect(impactStrengthBand(undefined)).toBe("weak");
    expect(impactStrengthBand(20)).toBe("weak");
    expect(impactStrengthBand(40)).toBe("fair");
    expect(impactStrengthBand(69)).toBe("fair");
    expect(impactStrengthBand(70)).toBe("strong");
    expect(impactStrengthLabel("weak")).toBe("Weak");
    expect(impactStrengthLabel("fair")).toBe("Fair");
    expect(impactStrengthLabel("strong")).toBe("Strong");
  });
});

describe("normalizeImpactBooster / clear", () => {
  it("returns empty answers for nullish or garbage input", () => {
    expect(normalizeImpactBooster(null)).toEqual({ answers: [] });
    expect(normalizeImpactBooster([])).toEqual({ answers: [] });
    expect(normalizeImpactBooster("nope")).toEqual({ answers: [] });
  });

  it("clearedImpactBooster empties content", () => {
    const cleared = clearedImpactBooster();
    expect(cleared).toEqual(EMPTY_IMPACT_BOOSTER);
    expect(hasImpactBoosterContent(cleared)).toBe(false);
  });

  it("keeps valid answers and clamps freeform", () => {
    const state = normalizeImpactBooster({
      strength: 120,
      missingLevers: ["time", "bogus", "money"],
      summary: "Needs time metrics",
      answers: [
        { question: "How much time?", category: "impact", answer: "  4 hrs  ", lever: "time" },
        { question: "", answer: "orphan" },
      ],
      freeform: "x".repeat(2500),
    });
    expect(state.strength).toBe(100);
    expect(state.missingLevers).toEqual(["time", "money"]);
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0].answer).toBe("4 hrs");
    expect(state.freeform?.length).toBe(2000);
  });
});

describe("buildImpactBoosterContext", () => {
  it("returns empty when no answers or freeform", () => {
    expect(buildImpactBoosterContext({ answers: [] })).toBe("");
    expect(buildImpactBoosterContext(undefined)).toBe("");
  });

  it("builds labeled context from answers + freeform", () => {
    const state: ImpactBoosterState = {
      answers: [
        {
          question: "How much time saved?",
          category: "impact",
          answer: "Cut 6 hrs to 45 mins for the flight",
          lever: "time",
        },
      ],
      freeform: "Reused spare switches instead of a buy",
    };
    const ctx = buildImpactBoosterContext(state);
    expect(ctx).toContain("=== IMPACT BOOSTER DETAILS (user-provided) ===");
    expect(ctx).toContain("[time]");
    expect(ctx).toContain("How much time saved?");
    expect(ctx).toContain("Cut 6 hrs to 45 mins for the flight");
    expect(ctx).toContain("Additional notes:");
    expect(ctx).toContain("Reused spare switches");
  });

  it("scopes context by sentenceNumber so dual accomplishments stay distinct", () => {
    const state: ImpactBoosterState = {
      answers: [
        {
          question: "Man-hours?",
          category: "impact",
          answer: "40 man-hrs for flight training",
          lever: "time",
          sentenceNumber: 1,
        },
        {
          question: "Man-hours?",
          category: "impact",
          answer: "12 man-hrs for cyber patching",
          lever: "time",
          sentenceNumber: 2,
        },
      ],
      sentenceFreeform: {
        "1": "Enabled next-day sortie generation",
        "2": "Prevented ATO delay",
      },
    };
    const ctx = buildImpactBoosterContext(state);
    expect(ctx).toContain("SENTENCE / ACCOMPLISHMENT 1");
    expect(ctx).toContain("SENTENCE / ACCOMPLISHMENT 2");
    expect(ctx).toContain("do not mix");
    expect(ctx).toContain("40 man-hrs for flight training");
    expect(ctx).toContain("12 man-hrs for cyber patching");
    expect(ctx).toContain("Enabled next-day sortie generation");
    expect(ctx).toContain("Prevented ATO delay");
  });
});

describe("answer upsert / remove / freeform", () => {
  it("upserts the same question separately per sentenceNumber", () => {
    let state: ImpactBoosterState = { answers: [] };
    state = upsertImpactBoosterAnswer(state, {
      question: "Man-hours?",
      category: "impact",
      answer: "S1 answer",
      lever: "time",
      sentenceNumber: 1,
    });
    state = upsertImpactBoosterAnswer(state, {
      question: "Man-hours?",
      category: "impact",
      answer: "S2 answer",
      lever: "time",
      sentenceNumber: 2,
    });
    expect(state.answers).toHaveLength(2);
    expect(state.answers.map((a) => a.answer).sort()).toEqual(["S1 answer", "S2 answer"]);
  });

  it("upserts by question and removes cleanly", () => {
    let state: ImpactBoosterState = { answers: [] };
    state = upsertImpactBoosterAnswer(state, {
      question: "Money saved?",
      category: "impact",
      answer: "$12K avoided",
      lever: "money",
    });
    state = upsertImpactBoosterAnswer(state, {
      question: "Money saved?",
      category: "impact",
      answer: "$15K avoided",
      lever: "money",
    });
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0].answer).toBe("$15K avoided");

    state = removeImpactBoosterAnswer(state, "Money saved?");
    expect(state.answers).toHaveLength(0);
  });

  it("setImpactBoosterFreeform clears when empty", () => {
    let state = setImpactBoosterFreeform({ answers: [] }, " note ");
    expect(state.freeform).toBe("note");
    state = setImpactBoosterFreeform(state, "   ");
    expect(state.freeform).toBeUndefined();
  });
});

describe("mergeImpactAssessment / parseImpactAssessment", () => {
  it("parses assessment and merges without wiping answers", () => {
    const parsed = parseImpactAssessment({
      strength: 42,
      missingLevers: ["time", "resources", "nope"],
      summary: "Weak on time",
    });
    expect(parsed).toEqual({
      strength: 42,
      missingLevers: ["time", "resources"],
      summary: "Weak on time",
    });

    const merged = mergeImpactAssessment(
      {
        answers: [
          { question: "Q", category: "impact", answer: "A", lever: "money" },
        ],
        freeform: "keep me",
      },
      parsed
    );
    expect(merged.answers).toHaveLength(1);
    expect(merged.freeform).toBe("keep me");
    expect(merged.strength).toBe(42);
    expect(merged.missingLevers).toEqual(["time", "resources"]);
  });

  it("rejects invalid assessment payloads", () => {
    expect(parseImpactAssessment(null)).toBeNull();
    expect(parseImpactAssessment({ summary: "no strength" })).toBeNull();
  });
});

describe("AF stewardship defaults", () => {
  it("uses AF vernacular in fallback prompts and stewardship brief", () => {
    const text = DEFAULT_IMPACT_BOOSTER_PROMPTS.map((p) => p.question).join(" ");
    expect(text).toMatch(/man-hours/i);
    expect(text).toMatch(/cost avoidance/i);
    expect(text).toMatch(/equipment|manpower|cross-org/i);
    expect(text).not.toMatch(/your office/i);
    expect(AF_STEWARDSHIP_IMPACT_BRIEF).toMatch(/Managing Resources|Stewardship/i);
    expect(AF_STEWARDSHIP_IMPACT_BRIEF).toMatch(/man-hours/i);
    expect(AF_STEWARDSHIP_IMPACT_BRIEF).toMatch(
      /schedule compression|ahead|% faster|early/i
    );
    const timePrompt = DEFAULT_IMPACT_BOOSTER_PROMPTS.find((p) => p.lever === "time");
    expect(timePrompt?.hint).toMatch(/early|% faster|Baseline/i);
    expect(DEFAULT_IMPACT_BOOSTER_PROMPTS.map((p) => p.lever).sort()).toEqual([
      "money",
      "resources",
      "time",
    ]);
  });
});

describe("boundary: statement move must not copy booster", () => {
  it("documents that cleared booster is independent of statement text", () => {
    // Use This / sentence move only persist statement_text via handleSaveSection.
    // Clearing booster must yield empty injectable context.
    const before: ImpactBoosterState = {
      answers: [{ question: "Q", category: "impact", answer: "A", lever: "time" }],
      freeform: "notes",
    };
    expect(hasImpactBoosterContent(before)).toBe(true);
    const afterClear = clearedImpactBooster();
    expect(buildImpactBoosterContext(afterClear)).toBe("");
    expect(hasImpactBoosterContent(afterClear)).toBe(false);
  });
});
