import { describe, expect, it } from "vitest";
import {
  buildRephraseModeInstructions,
  buildRephraseSystemOverride,
  buildSourceFactsPrompt,
  buildSpanContextInstruction,
  formatClarifyingAnswers,
  inferRevisionTense,
  isUnderspecifiedSelection,
  parseClarifyingQuestions,
  parseReviseSelectionLlmOutput,
  sanitizeReviseContext,
} from "@/lib/revise-rephrase";

const THIN =
  "optimizing comm asset deployment & management for a named operation";
const RICH =
  "Led 12 Amn through a $2M C4I upgrade across 10 sites, cutting outages 90%.";

describe("isUnderspecifiedSelection", () => {
  it("flags the verb-only duty fragment with a named-operation placeholder", () => {
    expect(isUnderspecifiedSelection(THIN)).toBe(true);
  });

  it("does not flag a quantified accomplishment", () => {
    expect(isUnderspecifiedSelection(RICH)).toBe(false);
  });
});

describe("parseReviseSelectionLlmOutput", () => {
  it("reads revisions plus questions from an object payload", () => {
    const text = `
Here you go
{"revisions":["deploys & manages comm assets for a named operation","deployment & management of comm assets for a named operation","named-operation comm assets: deployment & management"],"questions":["What did optimizing actually change?","Which comm assets?","Can the operation be named?"]}
`;
    const parsed = parseReviseSelectionLlmOutput(text, 3);
    expect(parsed.revisions).toHaveLength(3);
    expect(parsed.revisions[0]).toMatch(/deploys/i);
    expect(parsed.questions).toHaveLength(3);
  });

  it("still accepts the legacy JSON array", () => {
    const parsed = parseReviseSelectionLlmOutput(
      `["alpha rewrite here","bravo rewrite here","charlie rewrite here"]`,
      3,
    );
    expect(parsed.revisions).toHaveLength(3);
    expect(parsed.questions).toEqual([]);
  });
});

describe("parseClarifyingQuestions", () => {
  it("caps length, drops junk, and de-dupes", () => {
    expect(
      parseClarifyingQuestions([
        "What did optimizing actually change?",
        "What did optimizing actually change?",
        "no",
        "Which comm assets were involved in this work?",
      ]),
    ).toEqual([
      "What did optimizing actually change?",
      "Which comm assets were involved in this work?",
    ]);
  });
});

describe("sanitizeReviseContext / formatClarifyingAnswers", () => {
  it("joins answered questions and strips control characters", () => {
    const out = formatClarifyingAnswers(
      ["What did optimizing mean?", "Which assets?"],
      ["allocating radios\u0000", ""],
    );
    expect(out).toContain("allocating radios");
    expect(out).not.toContain("Which assets");
    expect(out).not.toContain("\u0000");
  });

  it("truncates overlong context", () => {
    expect(sanitizeReviseContext("x".repeat(800)).length).toBe(600);
  });
});

describe("inferRevisionTense", () => {
  it("keeps gerund duty fragments in present participle", () => {
    expect(inferRevisionTense(THIN, `Led 12 Amn. ${THIN}.`)).toBe(
      "present_participle",
    );
  });

  it("keeps past MPA openings in past tense", () => {
    expect(inferRevisionTense(RICH)).toBe("past");
  });

  it("does not treat 'named operation' as past tense", () => {
    expect(
      inferRevisionTense(
        "optimizing comm asset deployment & management for a named operation",
      ),
    ).toBe("present_participle");
  });
});

describe("rephrase prompt copy", () => {
  it("forbids verb-swap clones and tense flips for gerund spans", () => {
    const mode = buildRephraseModeInstructions(3, "present_participle");
    expect(mode).toMatch(/VERB-SWAP CLONES ARE FAILURES/i);
    expect(mode).toContain(THIN);
    expect(mode).toMatch(/streamlining comm asset deployment/i);
    expect(mode).toMatch(/deploying & managing/i);
    expect(mode).toMatch(/deploys & manages comm assets for a named operation" \(WRONG TENSE/i);
    expect(mode).toMatch(/VERB-LESS NOUN PHRASES ARE FAILURES/i);
    expect(mode).toMatch(/deployment & management of comm assets[\s\S]*NO VERB/i);
    expect(mode).toMatch(/managing named-operation comm-asset deployment/i);
    const good = mode.split("**GOOD")[1] ?? "";
    expect(good).not.toMatch(/deployment & management of comm assets/);

    const override = buildRephraseSystemOverride(3, true, "present_participle");
    expect(override).toContain('"questions"');
    expect(override).toMatch(/different sentence architecture/i);
    expect(override).toMatch(/PRESENT PARTICIPLE/i);
  });

  it("locks duty descriptions to present finite", () => {
    const mode = buildRephraseModeInstructions(3, "present_finite");
    expect(mode).toMatch(/PRESENT FINITE/i);
    expect(mode).toMatch(/deploys & manages comm assets/i);
    expect(mode).toMatch(/VERB REQUIRED/i);
    expect(mode).toMatch(/NO VERB/i);
  });
});

describe("surrounding statement context", () => {
  it("keeps package-level metrics out of the selected-span fact list", () => {
    const prompt = buildSourceFactsPrompt(
      THIN,
      `Led 12 Amn through a $2M C4I upgrade. ${THIN}.`,
    );
    expect(prompt).toMatch(/REST OF THE STATEMENT/i);
    expect(prompt).toMatch(/12/);
    expect(prompt).toMatch(/2M/);
    expect(prompt).toMatch(/selected span/i);
  });

  it("requires the rewrite to stay a span inside the full statement", () => {
    expect(buildSpanContextInstruction()).toMatch(/SPAN inside a larger statement/i);
    expect(buildSpanContextInstruction()).toMatch(/Do not output the surrounding sentences/i);
  });
});
