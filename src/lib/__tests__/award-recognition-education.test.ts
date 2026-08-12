import { describe, expect, it } from "vitest";
import {
  composeRecognitionPhrase,
  formatAwardShortLabel,
  mergeRecognitionIntoOutcome,
  type AwardRecognitionInput,
} from "@/lib/award-recognition";
import {
  normalizeEducationContext,
  sanitizeEducationContext,
  educationContextSummary,
  formatEducationContextForPrompt,
} from "@/lib/education-context";
import { awardsMatchRatee } from "@/lib/accomplishment-award-link";

function award(
  partial: Partial<AwardRecognitionInput> & Pick<AwardRecognitionInput, "id" | "award_type">
): AwardRecognitionInput {
  return {
    award_name: null,
    coin_presenter: null,
    coin_date: null,
    quarter: null,
    award_year: null,
    award_level: null,
    is_team_award: false,
    ...partial,
  };
}

describe("composeRecognitionPhrase", () => {
  it("returns null for empty list", () => {
    expect(composeRecognitionPhrase([])).toBeNull();
  });

  it("formats a single coin", () => {
    expect(
      composeRecognitionPhrase([
        award({
          id: "1",
          award_type: "coin",
          coin_presenter: "83 NOS/CC",
        }),
      ])
    ).toBe("earning a 83 NOS/CC coin");
  });

  it("formats a team coin contribution", () => {
    expect(
      composeRecognitionPhrase([
        award({
          id: "1",
          award_type: "coin",
          coin_presenter: "Wg/CC",
          is_team_award: true,
        }),
      ])
    ).toBe("contributed to a Wg/CC team coin");
  });

  it("combines multiple competitive awards", () => {
    const phrase = composeRecognitionPhrase([
      award({
        id: "1",
        award_type: "quarterly",
        award_level: "group",
        quarter: "Q1",
        award_year: 2026,
      }),
      award({
        id: "2",
        award_type: "annual",
        award_level: "group",
        award_year: 2026,
      }),
    ]);
    expect(phrase).toContain("earning");
    expect(phrase).toContain("Gp");
    expect(phrase).toContain("awards");
  });

  it("formats short labels for chips", () => {
    expect(
      formatAwardShortLabel(
        award({
          id: "1",
          award_type: "special",
          award_name: "John Levitow Award",
        })
      )
    ).toBe("John Levitow Award");
  });
});

describe("mergeRecognitionIntoOutcome", () => {
  it("sets outcome when empty", () => {
    expect(mergeRecognitionIntoOutcome("", "earning a Gp qtr award", null)).toBe(
      "earning a Gp qtr award"
    );
  });

  it("does not clobber existing outcome that already includes phrase", () => {
    expect(
      mergeRecognitionIntoOutcome(
        "cut cycle 40%; earning a Gp qtr award",
        "earning a Gp qtr award",
        "earning a Gp qtr award"
      )
    ).toBe("cut cycle 40%; earning a Gp qtr award");
  });

  it("appends new recognition without wiping user text", () => {
    expect(
      mergeRecognitionIntoOutcome("cut cycle 40%", "earning a Gp qtr award", null)
    ).toBe("cut cycle 40%; earning a Gp qtr award");
  });

  it("replaces previous auto phrase", () => {
    expect(
      mergeRecognitionIntoOutcome(
        "cut cycle 40%; earning a Sq qtr award",
        "earning a Gp qtr award",
        "earning a Sq qtr award"
      )
    ).toBe("cut cycle 40%; earning a Gp qtr award");
  });

  it("clears auto phrase when awards removed", () => {
    expect(
      mergeRecognitionIntoOutcome(
        "earning a Gp qtr award",
        null,
        "earning a Gp qtr award"
      )
    ).toBe("");
  });
});

describe("education context", () => {
  it("normalizes and drops empty program", () => {
    expect(normalizeEducationContext({ program: "  " })).toBeNull();
    expect(sanitizeEducationContext({ program: "CCAF", credits: -1 })).toEqual({
      program: "CCAF",
    });
  });

  it("keeps positive credits with unit", () => {
    expect(
      normalizeEducationContext({
        program: "CCAF AAS",
        credits: 12,
        unit: "semester_hours",
        completed_date: "2026-05-01",
      })
    ).toEqual({
      program: "CCAF AAS",
      credits: 12,
      unit: "semester_hours",
      completed_date: "2026-05-01",
    });
  });

  it("summarizes for badges", () => {
    expect(
      educationContextSummary({
        program: "ALS",
        credits: 5,
        unit: "credit_hours",
      })
    ).toBe("ALS (5 cr)");
  });

  it("formats for assessment prompts", () => {
    const text = formatEducationContextForPrompt({
      program: "CCAF",
      credits: 6,
      unit: "credit_hours",
    });
    expect(text).toContain("CCAF");
    expect(text).toContain("mission application");
  });
});

describe("awardsMatchRatee", () => {
  it("allows empty award list", () => {
    expect(awardsMatchRatee([], [], "user-1", null)).toEqual({ ok: true });
  });

  it("rejects awards for a different ratee", () => {
    const result = awardsMatchRatee(
      [
        {
          id: "a1",
          recipient_profile_id: "other",
          recipient_team_member_id: null,
        },
      ],
      ["a1"],
      "user-1",
      null
    );
    expect(result.ok).toBe(false);
  });

  it("accepts awards for the matching profile", () => {
    expect(
      awardsMatchRatee(
        [
          {
            id: "a1",
            recipient_profile_id: "user-1",
            recipient_team_member_id: null,
          },
        ],
        ["a1"],
        "user-1",
        null
      )
    ).toEqual({ ok: true });
  });

  it("accepts awards for matching managed member", () => {
    expect(
      awardsMatchRatee(
        [
          {
            id: "a1",
            recipient_profile_id: null,
            recipient_team_member_id: "tm-1",
          },
        ],
        ["a1"],
        null,
        "tm-1"
      )
    ).toEqual({ ok: true });
  });
});
