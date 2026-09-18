import { describe, expect, it } from "vitest";
import {
  applyRangeReplacement,
  isSingleSelectableWord,
  preserveReplacementCase,
  sanitizeThesaurusWord,
  sentenceContainingRange,
  shouldAutoFetchSuggestions,
  splitSuggestedAndRest,
  resolveThesaurusDocumentContext,
} from "@/lib/word-thesaurus";

describe("isSingleSelectableWord", () => {
  it("accepts a simple action verb", () => {
    expect(isSingleSelectableWord("Led")).toBe(true);
    expect(isSingleSelectableWord("  drove  ")).toBe(true);
  });

  it("accepts hyphenated and possessive forms", () => {
    expect(isSingleSelectableWord("mission-ready")).toBe(true);
    expect(isSingleSelectableWord("Airman's")).toBe(true);
  });

  it("rejects phrases and numbers", () => {
    expect(isSingleSelectableWord("Led team")).toBe(false);
    expect(isSingleSelectableWord("90%")).toBe(false);
    expect(isSingleSelectableWord("")).toBe(false);
  });
});

describe("shouldAutoFetchSuggestions", () => {
  it("skips tiny and function words to avoid wasting an LLM call", () => {
    expect(shouldAutoFetchSuggestions("to")).toBe(false);
    expect(shouldAutoFetchSuggestions("the")).toBe(false);
    expect(shouldAutoFetchSuggestions("a")).toBe(false);
  });

  it("runs for impact verbs", () => {
    expect(shouldAutoFetchSuggestions("Led")).toBe(true);
    expect(shouldAutoFetchSuggestions("orchestrated")).toBe(true);
  });
});

describe("sentenceContainingRange", () => {
  it("returns the sentence that owns the highlighted word", () => {
    const text =
      "Led 12 Amn through a $2M upgrade. Directed cyber ops across 10 sites.";
    const start = text.indexOf("Directed");
    expect(sentenceContainingRange(text, start, start + "Directed".length)).toBe(
      "Directed cyber ops across 10 sites.",
    );
  });

  it("returns the first sentence when the selection is in it", () => {
    const text = "Led 12 Amn through a $2M upgrade. Directed cyber ops.";
    const start = text.indexOf("Led");
    expect(sentenceContainingRange(text, start, start + 3)).toBe(
      "Led 12 Amn through a $2M upgrade.",
    );
  });

  it("falls back to the full text when there are no sentence breaks", () => {
    const text = "Led 12 Amn through a $2M upgrade";
    expect(sentenceContainingRange(text, 0, 3)).toBe(text);
  });
});

describe("preserveReplacementCase", () => {
  it("keeps title case when the original was capitalized", () => {
    expect(preserveReplacementCase("Led", "drove")).toBe("Drove");
  });

  it("keeps all-caps replacements for acronyms", () => {
    expect(preserveReplacementCase("NCOIC", "superintendent")).toBe("SUPERINTENDENT");
  });

  it("lowercases a title-case replacement when the original was lowercase", () => {
    expect(preserveReplacementCase("led", "Drove")).toBe("drove");
  });

  it("keeps short acronyms even when the original was lowercase", () => {
    expect(preserveReplacementCase("ncoic", "NCOIC")).toBe("NCOIC");
  });
});

describe("applyRangeReplacement", () => {
  it("replaces only the selected span", () => {
    expect(applyRangeReplacement("Led 12 Amn. Directed ops.", 0, 3, "Drove")).toBe(
      "Drove 12 Amn. Directed ops.",
    );
  });
});

describe("splitSuggestedAndRest", () => {
  it("dedupes case-insensitively and splits the suggested list", () => {
    const { suggested, rest } = splitSuggestedAndRest(
      ["Drove", "drove", "Directed", "Managed", "Led", "Ran", "Oversaw", "Guided"],
      3,
    );
    expect(suggested).toEqual(["Drove", "Directed", "Managed"]);
    expect(rest).toEqual(["Led", "Ran", "Oversaw", "Guided"]);
  });
});

describe("resolveThesaurusDocumentContext", () => {
  it("uses the field text when no extra context is passed", () => {
    expect(
      resolveThesaurusDocumentContext({
        fieldText: "Led 12 Amn optimizing comm assets",
        fieldStart: 11,
        fieldEnd: 33,
      }),
    ).toEqual({
      fullStatement: "Led 12 Amn optimizing comm assets",
      selectionStart: 11,
      selectionEnd: 33,
    });
  });

  it("maps a split-view sentence-2 highlight onto the combined package", () => {
    const s1 = "Led 12 Amn through a $2M C4I upgrade";
    const s2 = "optimizing comm asset deployment & management for a named operation";
    const combined = `${s1}. ${s2}.`;
    const mapped = resolveThesaurusDocumentContext({
      fieldText: s2,
      fieldStart: 0,
      fieldEnd: s2.length,
      contextText: combined,
    });
    expect(mapped.fullStatement).toBe(combined);
    expect(mapped.fullStatement.slice(mapped.selectionStart, mapped.selectionEnd)).toBe(s2);
  });
});

describe("sanitizeThesaurusWord", () => {
  it("trims and caps length", () => {
    expect(sanitizeThesaurusWord("  Led  ")).toBe("Led");
    expect(sanitizeThesaurusWord("x".repeat(80)).length).toBe(40);
  });
});
