import { describe, expect, it } from "vitest";
import {
  formatUsageActionLabel,
  isWritingAssistAction,
  WRITING_ASSIST_ACTIONS,
} from "../admin/usage-formatters";

describe("formatUsageActionLabel", () => {
  it("labels synonym and phrase-revise tracking actions", () => {
    expect(formatUsageActionLabel("synonyms")).toBe("Synonym suggestions");
    expect(formatUsageActionLabel("revise_expand")).toBe("Expand");
    expect(formatUsageActionLabel("revise_compress")).toBe("Compress");
    expect(formatUsageActionLabel("revise_rephrase")).toBe("Rephrase");
    expect(formatUsageActionLabel("revise_selection")).toBe("Phrase revise");
  });

  it("title-cases unknown actions", () => {
    expect(formatUsageActionLabel("custom_widget")).toBe("Custom Widget");
  });
});

describe("writing assist actions", () => {
  it("pins synonym plus expand / compress / rephrase", () => {
    expect([...WRITING_ASSIST_ACTIONS]).toEqual([
      "synonyms",
      "revise_expand",
      "revise_compress",
      "revise_rephrase",
    ]);
    expect(isWritingAssistAction("synonyms")).toBe(true);
    expect(isWritingAssistAction("generate")).toBe(false);
  });
});
