import { describe, expect, it } from "vitest";
import {
  PERSONNEL_REFERENCE_GUIDANCE,
  containsSpecificPersonnelRank,
} from "@/lib/personnel-reference";
import { DEFAULT_EPB_SYSTEM_PROMPT } from "@/lib/default-llm-prompts";

describe("personnel-reference", () => {
  it("embeds guidance in the default EPB system prompt", () => {
    expect(DEFAULT_EPB_SYSTEM_PROMPT).toContain("PERSONNEL REFERENCES");
    expect(DEFAULT_EPB_SYSTEM_PROMPT).toContain("3-mbr team");
    expect(DEFAULT_EPB_SYSTEM_PROMPT).toContain("joint team");
    expect(DEFAULT_EPB_SYSTEM_PROMPT).toContain("coalition partners");
    expect(DEFAULT_EPB_SYSTEM_PROMPT).toContain(PERSONNEL_REFERENCE_GUIDANCE);
  });

  it("directs multi-service and partner-nation work to joint/coalition framing", () => {
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain("JOINT / MULTI-SERVICE / COALITION");
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain("Army, Navy, Marine Corps");
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain("coalition partners");
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain(
      "Worked with Army, Navy, and Marines on the exercise"
    );
  });

  it("forbids awkward team possessives and prefers mbr team openers", () => {
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain("TEAM OPENER STRUCTURE");
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain(
      "Drove 2-person team's career development"
    );
    expect(PERSONNEL_REFERENCE_GUIDANCE).toContain("2-mbr team");
    expect(PERSONNEL_REFERENCE_GUIDANCE).not.toContain("6-person crew");
  });

  it("flags specific ranks used as people descriptors", () => {
    expect(
      containsSpecificPersonnelRank(
        "Mentored two TSgts on strat board packages"
      )
    ).toBe(true);
    expect(
      containsSpecificPersonnelRank("Led 3 SSgts during network cutover")
    ).toBe(true);
    expect(
      containsSpecificPersonnelRank("Guided A1Cs through package reviews")
    ).toBe(true);
  });

  it("allows generic groups and hyphenated team forms", () => {
    expect(
      containsSpecificPersonnelRank(
        "Mentored 2 Airmen on strat board packages"
      )
    ).toBe(false);
    expect(
      containsSpecificPersonnelRank(
        "Led 3-mbr team during network cutover"
      )
    ).toBe(false);
    expect(
      containsSpecificPersonnelRank(
        "Directed 4-Amn team through renovations"
      )
    ).toBe(false);
    expect(
      containsSpecificPersonnelRank(
        "Guided members through package reviews"
      )
    ).toBe(false);
  });
});
