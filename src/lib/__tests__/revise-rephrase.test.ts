import { describe, expect, it } from "vitest";
import {
  buildRephraseModeInstructions,
  buildRephraseSystemOverride,
  formatClarifyingAnswers,
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

describe("rephrase prompt copy", () => {
  it("forbids verb-swap clones and shows the user's example as a failure", () => {
    const mode = buildRephraseModeInstructions(3, true);
    expect(mode).toMatch(/VERB-SWAP CLONES ARE FAILURES/i);
    expect(mode).toContain(THIN);
    expect(mode).toMatch(/streamlining comm asset deployment/i);
    expect(mode).toMatch(/PRESENT TENSE/);

    const override = buildRephraseSystemOverride(3, true);
    expect(override).toContain('"questions"');
    expect(override).toMatch(/different sentence architecture/i);
  });
});
