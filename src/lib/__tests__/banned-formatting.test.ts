import { describe, expect, it } from "vitest";
import {
  MAX_BANNED_FORMATTING_REVISIONS,
  applyDeterministicBannedFormattingFixes,
  findBannedFormattingViolations,
  hasBannedFormatting,
  repairBannedFormatting,
} from "@/lib/banned-formatting";

const USER_EXAMPLE =
  "Established sq's Integration Section w/ 3 instructors delivering 160 hrs qualification training, accelerating 9 cyber operators to FMC & cutting qualification time from 6 mos to 3 wks; directed 3 Amn in identifying & fixing training gap via server installation guide w/ 91 tasks equipping 75 operators for 96 AFCYBER missions.";

describe("findBannedFormattingViolations", () => {
  it("flags w/ and semicolons in real EPB hallucination example", () => {
    const violations = findBannedFormattingViolations(USER_EXAMPLE);
    const labels = violations.map((v) => v.label);
    expect(labels).toContain("w/");
    expect(labels).toContain(";");
  });

  it("flags w/ without a trailing space (w/3)", () => {
    expect(hasBannedFormatting("Led team w/3 instructors")).toBe(true);
  });

  it("flags w/o and b/c", () => {
    const labels = findBannedFormattingViolations(
      "Completed task w/o delay b/c of planning"
    ).map((v) => v.label);
    expect(labels).toContain("w/o");
    expect(labels).toContain("b/c");
  });

  it("does not flag clean statements", () => {
    expect(
      hasBannedFormatting(
        "Led 3 instructors delivering 160 hrs qualification training, accelerating 9 cyber operators to FMC."
      )
    ).toBe(false);
  });

  it("flags < comparison shorthand and unicode em-dash", () => {
    const labels = findBannedFormattingViolations(
      "restored access <24hrs—vital to ops"
    ).map((v) => v.label);
    expect(labels).toContain("<");
    expect(labels).toContain("—");
  });

  it("flags > comparison shorthand", () => {
    expect(hasBannedFormatting("sustained >90% FMC")).toBe(true);
  });
});

describe("applyDeterministicBannedFormattingFixes", () => {
  it("expands w/ and replaces semicolons in the user example", () => {
    const { text, fixedLabels, changed } =
      applyDeterministicBannedFormattingFixes(USER_EXAMPLE);

    expect(changed).toBe(true);
    expect(fixedLabels).toContain("w/");
    expect(fixedLabels).toContain(";");
    expect(text).not.toMatch(/\bw\//i);
    expect(text).not.toContain(";");
    expect(text).toContain("with 3 instructors");
    expect(text).toContain("with 91 tasks");
    expect(text).toContain(", directed 3 Amn");
  });

  it("expands w/o before w/ so without is not mangled", () => {
    const { text } = applyDeterministicBannedFormattingFixes(
      "Finished w/o support w/ 2 techs"
    );
    expect(text).toContain("without");
    expect(text).toContain("with 2");
    expect(text).not.toMatch(/\bw\//i);
  });

  it("rewrites <24hrs—vital style hallucinations", () => {
    const { text } = applyDeterministicBannedFormattingFixes(
      "restored access <24hrs—vital to ops"
    );
    expect(text).not.toContain("<");
    expect(text).not.toMatch(/[\u2013\u2014\u2015]/);
    expect(text).toContain("under 24hrs");
    expect(text).toContain(", vital");
  });

  it("rewrites >90% to over 90%", () => {
    const { text } = applyDeterministicBannedFormattingFixes(
      "sustained >90% FMC across the fleet"
    );
    expect(text).not.toContain(">");
    expect(text).toContain("over 90%");
  });
});

describe("repairBannedFormatting", () => {
  it("repairs via deterministic path without calling the LLM", async () => {
    const result = await repairBannedFormatting(USER_EXAMPLE, {
      maxAttempts: 2,
      // no model — must stay deterministic
    });

    expect(result.wasFlagged).toBe(true);
    expect(result.method).toBe("deterministic");
    expect(result.attempts).toBe(0);
    expect(result.remainingViolations).toEqual([]);
    expect(result.statement).not.toMatch(/\bw\//i);
    expect(result.statement).not.toContain(";");
  });

  it("returns unchanged when there are no violations", async () => {
    const clean =
      "Led 12 Airmen rebuilding 8 servers, ensuring access for 58K users.";
    const result = await repairBannedFormatting(clean);
    expect(result.wasFlagged).toBe(false);
    expect(result.method).toBe("none");
    expect(result.statement).toBe(clean);
  });

  it("hard-caps LLM attempts and skips LLM when deterministic fully repairs", async () => {
    expect(MAX_BANNED_FORMATTING_REVISIONS).toBe(2);

    const result = await repairBannedFormatting(USER_EXAMPLE, {
      maxAttempts: 99, // request above ceiling — still must not loop
    });
    expect(result.attempts).toBe(0);
    expect(result.attempts).toBeLessThanOrEqual(MAX_BANNED_FORMATTING_REVISIONS);
    expect(result.method).toBe("deterministic");
  });
});
