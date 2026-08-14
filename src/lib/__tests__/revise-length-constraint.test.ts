import { describe, expect, it } from "vitest";
import {
  buildReviseLengthGuidance,
  buildSentenceCountGuidance,
  expectedRevisionSentenceCount,
  sanitizeMaxCharacters,
  selectionBudget,
  withinLimitTargetMin,
} from "@/lib/revise-length-constraint";

describe("sanitizeMaxCharacters", () => {
  it("accepts EPB field maxima", () => {
    expect(sanitizeMaxCharacters(350)).toBe(350);
    expect(sanitizeMaxCharacters(250)).toBe(250);
    expect(sanitizeMaxCharacters("450")).toBe(450);
  });

  it("rejects missing or out-of-range values", () => {
    expect(sanitizeMaxCharacters(undefined)).toBeUndefined();
    expect(sanitizeMaxCharacters(null)).toBeUndefined();
    expect(sanitizeMaxCharacters(10)).toBeUndefined();
    expect(sanitizeMaxCharacters(99999)).toBeUndefined();
    expect(sanitizeMaxCharacters("nope")).toBeUndefined();
  });
});

describe("selectionBudget", () => {
  it("equals the field max when revising the whole statement", () => {
    expect(selectionBudget(350, 0)).toBe(350);
  });

  it("subtracts surrounding text for a partial selection", () => {
    expect(selectionBudget(350, 100)).toBe(250);
  });
});

describe("withinLimitTargetMin", () => {
  it("is 5% under the field max", () => {
    expect(withinLimitTargetMin(350)).toBe(332);
    expect(withinLimitTargetMin(250)).toBe(237);
  });
});

describe("buildReviseLengthGuidance", () => {
  it("tells the model to match original length when no max is set (legacy)", () => {
    const g = buildReviseLengthGuidance({
      selectedLength: 452,
      mode: "general",
    });
    expect(g.hardMax).toBeNull();
    expect(g.mustCompressToFit).toBe(false);
    expect(g.promptBlock).toMatch(/±20%/);
    expect(g.targetMax).toBeGreaterThan(452);
  });

  it("forces compression when the original is over the EPB 350 cap", () => {
    const g = buildReviseLengthGuidance({
      selectedLength: 452,
      maxCharacters: 350,
      mode: "general",
    });
    expect(g.hardMax).toBe(350);
    expect(g.selectionMax).toBe(350);
    expect(g.mustCompressToFit).toBe(true);
    expect(g.targetMax).toBe(350);
    expect(g.targetMin).toBe(332);
    expect(g.promptBlock).toMatch(/keep TWO sentences|SYNONYM-ONLY|Delete the weakest|REMOVE at least/i);
    expect(g.promptBlock).toMatch(/NON-NEGOTIABLE/);
    expect(g.promptBlock).toMatch(/SYNONYM-ONLY REWRITES FAIL/);
    expect(g.promptBlock).toMatch(/within 5%|MAXIMUM 350|aim/);
    expect(g.promptBlock).not.toMatch(/±20%/);
  });

  it("caps expand/general so they cannot grow past the field max", () => {
    const g = buildReviseLengthGuidance({
      selectedLength: 320,
      maxCharacters: 350,
      mode: "general",
    });
    expect(g.mustCompressToFit).toBe(false);
    expect(g.targetMin).toBe(332);
    expect(g.targetMax).toBe(350);
    expect(g.promptBlock).toMatch(/within 5%/);
    expect(g.promptBlock).toMatch(/NEVER exceed 350/);
  });

  it("does not tell expand to grow when already over the cap", () => {
    const g = buildReviseLengthGuidance({
      selectedLength: 400,
      maxCharacters: 350,
      mode: "expand",
    });
    expect(g.mustCompressToFit).toBe(true);
    expect(g.promptBlock).toMatch(/SYNONYM-ONLY REWRITES FAIL|do NOT merge the two sentences/);
    expect(g.targetMax).toBe(350);
  });
});

describe("expectedRevisionSentenceCount", () => {
  it("detects a two-sentence EPB package", () => {
    const text =
      "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness. Directed cyber center supporting 10 sites, vital for SOUTHCOM ops.";
    expect(expectedRevisionSentenceCount(text)).toBe(2);
    expect(buildSentenceCountGuidance(2)).toMatch(/TWO sentences/);
    expect(buildSentenceCountGuidance(2)).toMatch(/Do NOT merge/);
  });

  it("detects a single sentence", () => {
    expect(
      expectedRevisionSentenceCount(
        "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness."
      )
    ).toBe(1);
    expect(buildSentenceCountGuidance(1)).toMatch(/ONE sentence/);
  });
});
