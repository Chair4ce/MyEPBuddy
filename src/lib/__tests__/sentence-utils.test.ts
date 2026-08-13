import { describe, expect, it } from "vitest";
import {
  asPlainText,
  coalesceTwoSentenceRevisions,
  parseRevisionList,
  parseStatement,
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
