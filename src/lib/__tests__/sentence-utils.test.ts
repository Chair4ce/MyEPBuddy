import { describe, expect, it } from "vitest";
import {
  asPlainText,
  coalesceTwoSentenceRevisions,
  combineSentences,
  ensureRevisionCount,
  parseRevisionList,
  parseStatement,
  swapStatementSentences,
} from "@/lib/sentence-utils";

describe("asPlainText", () => {
  it("returns strings unchanged", () => {
    expect(asPlainText("Led team.")).toBe("Led team.");
  });

  it("joins nested sentence arrays without throwing", () => {
    expect(
      asPlainText(["Executed a $2M expansion, boosting readiness.", "Commanded AFSOUTH cyber center."])
    ).toBe("Executed a $2M expansion, boosting readiness. Commanded AFSOUTH cyber center.");
  });

  it("does not throw on null or objects", () => {
    expect(asPlainText(null)).toBe("");
    expect(asPlainText({ text: "Hello." })).toBe("Hello.");
  });
});

describe("parseRevisionList", () => {
  it("flattens nested two-sentence arrays from the model", () => {
    const raw = [
      ["Sent one about networks.", "Sent two about cyber."],
      "Already a single string. With two sentences.",
    ];
    const out = parseRevisionList(raw, 3);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("Sent one");
    expect(out[0]).toContain("Sent two");
    expect(out.every((s) => typeof s === "string")).toBe(true);
  });

  it("returns empty for garbage", () => {
    expect(parseRevisionList(null, 3)).toEqual([]);
    expect(parseRevisionList({}, 3)).toEqual([]);
  });
});

describe("ensureRevisionCount", () => {
  it("pads to 3 using the best available under-cap text", () => {
    const original = "Led team rebuilding servers, cut downtime 90%, boosting readiness.";
    const out = ensureRevisionCount(["Version A."], 3, original);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("Version A.");
    // With no max, pad with the longest available cleaned item (Version A.)
    expect(out[1]).toBe("Version A.");
    expect(out[2]).toBe("Version A.");
  });

  it("prefers an under-cap sibling when padding", () => {
    const under =
      "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness. Directed cyber center supporting 10 sites.";
    const over = Array.from({ length: 8 }, () => under).join(" ");
    expect(under.length).toBeLessThan(350);
    expect(over.length).toBeGreaterThan(350);
    const out = ensureRevisionCount([under], 3, over, 350);
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.length <= 350)).toBe(true);
    expect(out.every((r) => r === under)).toBe(true);
  });

  it("falls back to the original when nothing under the cap exists yet", () => {
    const original = "Short seed under the cap.";
    const over = Array.from(
      { length: 6 },
      () =>
        "This revision is intentionally far over the character budget with lots of extra descriptive wording."
    ).join(" ");
    expect(original.length).toBeLessThan(350);
    expect(over.length).toBeGreaterThan(350);
    const out = ensureRevisionCount([over], 3, original, 350);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(over);
    expect(out[1]).toBe(original);
    expect(out[2]).toBe(original);
  });

  it("never drops extras beyond the requested count", () => {
    const out = ensureRevisionCount(["a", "b", "c", "d"], 3, "fallback");
    expect(out).toEqual(["a", "b", "c"]);
  });
});

describe("coalesceTwoSentenceRevisions", () => {
  it("pairs a flat list of singles into two-sentence packages", () => {
    const out = coalesceTwoSentenceRevisions(
      [
        "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness.",
        "Directed cyber center supporting 10 sites, vital for SOUTHCOM ops.",
        "Built backup circuit for 3 wings, restored comms in 2 hrs.",
        "Authored cyber playbook resolving 12 MAJCOM tickets same day.",
      ],
      3
    );
    expect(out).toHaveLength(2);
    expect(parseStatement(out[0]).hasTwoSentences).toBe(true);
    expect(parseStatement(out[1]).hasTwoSentences).toBe(true);
    expect(out[0]).toMatch(/Led 5-mbr/);
    expect(out[0]).toMatch(/Directed cyber/);
  });

  it("leaves already-joined two-sentence revisions alone", () => {
    const joined =
      "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness. Directed cyber center supporting 10 sites, vital for SOUTHCOM ops.";
    expect(coalesceTwoSentenceRevisions([joined, joined], 3)).toEqual([
      joined,
      joined,
    ]);
  });
});

describe("parseStatement", () => {
  it("accepts a two-sentence string array without calling .trim on it", () => {
    const parsed = parseStatement([
      "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness.",
      "Directed cyber center supporting 10 sites, vital for SOUTHCOM ops.",
    ]);
    expect(parsed.hasTwoSentences).toBe(true);
    expect(parsed.sentences).toHaveLength(2);
  });
});

describe("swapStatementSentences", () => {
  it("swaps a two-sentence statement", () => {
    const original =
      "Led 12 Airmen through a 96-hour surge. Cut backlog 40% and restored combat sorties.";
    const swapped = swapStatementSentences(original);
    const parsed = parseStatement(swapped);
    expect(parsed.hasTwoSentences).toBe(true);
    expect(parsed.sentences[0].text).toBe(
      "Cut backlog 40% and restored combat sorties."
    );
    expect(parsed.sentences[1].text).toBe(
      "Led 12 Airmen through a 96-hour surge."
    );
  });

  it("is reversible", () => {
    const original =
      "Directed wing inspection prep across 4 squadrons. Zero write-ups at higher HQ.";
    expect(swapStatementSentences(swapStatementSentences(original))).toBe(
      combineSentences(
        parseStatement(original).sentences[0].text,
        parseStatement(original).sentences[1].text
      )
    );
  });

  it("leaves a single sentence unchanged", () => {
    const one = "Led 12 Airmen through a 96-hour surge.";
    expect(swapStatementSentences(one)).toBe(one);
  });

  it("leaves empty text unchanged", () => {
    expect(swapStatementSentences("")).toBe("");
    expect(swapStatementSentences("   ")).toBe("   ");
  });
});
