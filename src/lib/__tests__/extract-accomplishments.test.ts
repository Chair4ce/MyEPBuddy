import { describe, expect, it } from "vitest";
import {
  applyCombineToDrafts,
  combineBulkAccomplishmentDrafts,
  ensureDetailsStandAlone,
  mergeGrammarPolishedAccomplishments,
  normalizeExtractedAccomplishment,
  normalizeExtractedAccomplishments,
  toBulkDrafts,
  type BulkAccomplishmentDraft,
} from "@/lib/extract-accomplishments";

describe("normalizeExtractedAccomplishment", () => {
  it("returns null for empty or tiny details", () => {
    expect(normalizeExtractedAccomplishment({ details: "" })).toBeNull();
    expect(normalizeExtractedAccomplishment({ details: "short" })).toBeNull();
  });

  it("fills action verb from details when missing", () => {
    const result = normalizeExtractedAccomplishment({
      details: "Led squadron through inspection prep",
      mpa: "executing_mission",
      confidence: 0.9,
    });
    expect(result).toMatchObject({
      action_verb: "Led",
      details: "Led squadron through inspection prep",
      mpa: "executing_mission",
      confidence: 0.9,
    });
  });

  it("falls back invalid MPA to miscellaneous", () => {
    const result = normalizeExtractedAccomplishment({
      action_verb: "Directed",
      details: "Directed logistics surge for deployment",
      mpa: "not_a_real_mpa",
    });
    expect(result?.mpa).toBe("miscellaneous");
  });

  it("clamps confidence into 0..1", () => {
    expect(
      normalizeExtractedAccomplishment({
        details: "Managed $2M budget for unit ops",
        confidence: 4,
      })?.confidence,
    ).toBe(1);
    expect(
      normalizeExtractedAccomplishment({
        details: "Managed $2M budget for unit ops",
        confidence: -1,
      })?.confidence,
    ).toBe(0);
  });
});

describe("normalizeExtractedAccomplishments", () => {
  it("filters junk and respects cap", () => {
    const items = Array.from({ length: 45 }, (_, i) => ({
      action_verb: "Led",
      details: `Accomplishment number ${i} with enough text`,
      mpa: "leading_people",
      confidence: 0.8,
    }));
    const result = normalizeExtractedAccomplishments(items, 40);
    expect(result).toHaveLength(40);
  });

  it("ignores non-array payloads", () => {
    expect(normalizeExtractedAccomplishments(null)).toEqual([]);
    expect(normalizeExtractedAccomplishments({})).toEqual([]);
  });
});

describe("combineBulkAccomplishmentDrafts", () => {
  const base = (overrides: Partial<BulkAccomplishmentDraft>): BulkAccomplishmentDraft => ({
    id: "a",
    action_verb: "Led",
    details: "Did A",
    impact: "Result A",
    metrics: "10%",
    mpa: "executing_mission",
    confidence: 0.7,
    date: "2026-01-15",
    cycle_year: 2026,
    included: true,
    selectedForCombine: true,
    ...overrides,
  });

  it("returns null for fewer than 2 sources", () => {
    expect(combineBulkAccomplishmentDrafts([base({ id: "1" })])).toBeNull();
  });

  it("stacks details, impact, and metrics; keeps strongest MPA", () => {
    const merged = combineBulkAccomplishmentDrafts([
      base({
        id: "1",
        details: "Cut wait time",
        impact: "Faster throughput",
        metrics: "10%",
        mpa: "improving_unit",
        confidence: 0.5,
        date: "2026-02-01",
      }),
      base({
        id: "2",
        action_verb: "Directed",
        details: "Scaled the fix wing-wide",
        impact: "Unit adopted SOP",
        metrics: "40 hrs",
        mpa: "leading_people",
        confidence: 0.95,
        date: "2026-01-10",
      }),
    ]);

    expect(merged).toMatchObject({
      action_verb: "Directed",
      details: "Cut wait time; Scaled the fix wing-wide",
      impact: "Faster throughput; Unit adopted SOP",
      metrics: "10%; 40 hrs",
      mpa: "leading_people",
      confidence: 0.95,
      date: "2026-01-10",
      included: true,
      selectedForCombine: false,
    });
  });

  it("applyCombineToDrafts replaces selected rows at first selected index", () => {
    const drafts = [
      base({ id: "keep", selectedForCombine: false, details: "Keep me" }),
      base({ id: "c1", selectedForCombine: true, details: "One" }),
      base({ id: "c2", selectedForCombine: true, details: "Two", metrics: "5" }),
      base({ id: "tail", selectedForCombine: false, details: "Tail" }),
    ];
    const next = applyCombineToDrafts(drafts);
    expect(next).toHaveLength(3);
    expect(next[0]?.details).toBe("Keep me");
    expect(next[1]?.details).toBe("One; Two");
    expect(next[1]?.metrics).toBe("10%; 5");
    expect(next[2]?.details).toBe("Tail");
  });
});

describe("toBulkDrafts", () => {
  it("defaults include true and injects date/cycle", () => {
    const drafts = toBulkDrafts(
      [
        {
          action_verb: "Led",
          details: "Something meaningful enough",
          impact: "",
          metrics: "",
          mpa: "executing_mission",
          confidence: 0.8,
        },
      ],
      { date: "2026-08-11", cycleYear: 2026 },
    );
    expect(drafts[0]).toMatchObject({
      date: "2026-08-11",
      cycle_year: 2026,
      included: true,
      selectedForCombine: false,
    });
  });
});

describe("ensureDetailsStandAlone", () => {
  it("prepends action verb to fragment tails from bulk extract", () => {
    expect(
      ensureDetailsStandAlone(
        "Led",
        "teams of 36-65 personnel in 24/7 operations",
      ),
    ).toBe("Led teams of 36-65 personnel in 24/7 operations");

    expect(
      ensureDetailsStandAlone(
        "Served",
        "as Wing Technical Integration Lead and Executive Officer",
      ),
    ).toBe(
      "Served as Wing Technical Integration Lead and Executive Officer",
    );

    expect(
      ensureDetailsStandAlone(
        "Selected",
        "by AFSOUTH A6 for enterprise expertise",
      ),
    ).toBe("Selected by AFSOUTH A6 for enterprise expertise");

    expect(
      ensureDetailsStandAlone(
        "Authored",
        "wing's first data management operations order",
      ),
    ).toBe("Authored wing's first data management operations order");

    expect(
      ensureDetailsStandAlone("Developed", "post-ingest exploitation tools."),
    ).toBe("Developed post-ingest exploitation tools.");
  });

  it("does not double the verb when details already start with it", () => {
    expect(
      ensureDetailsStandAlone(
        "Led",
        "Led squadron cyber awareness stand-down for 42 CS personnel",
      ),
    ).toBe("Led squadron cyber awareness stand-down for 42 CS personnel");
  });
});

describe("mergeGrammarPolishedAccomplishments", () => {
  it("forces standalone details after polish", () => {
    const merged = mergeGrammarPolishedAccomplishments(
      [
        {
          action_verb: "Directed",
          details: "major upgrades and remediation efforts",
          impact: "Prevented potential outages",
          metrics: "27 errors",
          mpa: "executing_mission",
          confidence: 0.8,
        },
      ],
      [
        {
          action_verb: "Directed",
          details: "major upgrades and remediation efforts",
          impact: "Prevented potential outages for warfighters.",
          metrics: "27 errors",
        },
      ],
    );

    expect(merged[0]?.details).toBe(
      "Directed major upgrades and remediation efforts",
    );
    expect(merged[0]?.impact).toBe(
      "Prevented potential outages for warfighters.",
    );
  });
});
