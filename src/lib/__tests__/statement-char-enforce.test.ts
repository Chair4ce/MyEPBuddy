import { describe, expect, it } from "vitest";
import { parseStatement } from "@/lib/sentence-utils";
import {
  applyDeterministicCompress,
  combineStatementsForDisplay,
  combinedStatementLength,
  enforcePackageCharacterLimit,
  enforceRevisionText,
  fillRevisionsTowardCap,
  splitJoinedStatements,
} from "@/lib/statement-char-enforce";

const OVER_A =
  "Executed a $2M network expansion, transitioning 9 joint units to enduring IT, doubling bandwidth & broadening air picture across 2.2M sq mi, this enabled 24 kinetic strikes & interdiction of 42 vessels, enhancing USSOUTHCOM readiness.";
const OVER_B =
  "Commanded AFSOUTH's inaugural Cyber Coordination Center, supporting 10 locations, & authored framework allowing AFCYBER to resolve 12 MAJCOM issues in under 24 hrs, proving vital for SOUTHCOM OPs deployments.";

describe("combineStatementsForDisplay", () => {
  it("joins with space when first ends with period", () => {
    expect(combineStatementsForDisplay(["Foo.", "Bar."])).toBe("Foo. Bar.");
  });

  it("joins with period+space when first lacks period", () => {
    expect(combineStatementsForDisplay(["Foo", "Bar"])).toBe("Foo. Bar");
  });
});

describe("applyDeterministicCompress", () => {
  it("rewrites and→&, hours→hrs, and strips <", () => {
    const { length: before } = { length: "led the team and fixed issues in less than 24 hours".length };
    const out = applyDeterministicCompress(
      "led the team and fixed issues in less than 24 hours <24hrs—vital"
    );
    expect(out).toContain("&");
    expect(out).toContain("hrs");
    expect(out).not.toContain("<");
    expect(out).not.toMatch(/[\u2013\u2014]/);
    expect(out.length).toBeLessThan(before + 20);
  });

  it("shortens bolstering/within/migrating on the user over-limit package", () => {
    const v1 =
      "Executed a $2M network expansion, migrating 9 joint units to enduring IT, doubling bandwidth & expanding air picture across 2.2M sq mi, enabled 24 kinetic strikes & interdiction of 42 vessels, bolstering USSOUTHCOM readiness. Commanded AFSOUTH's 1st Cyber Coordination Center, supporting 10 locations, drafted framework enabling 12 MAJCOM issues resolved by AFCYBER within 24hrs & vital to SOUTHCOM OPs deployments.";
    const parts = splitJoinedStatements(v1);
    const det = parts.map(applyDeterministicCompress);
    const after = combinedStatementLength(det);
    expect(after).toBeLessThan(v1.length);
    expect(det.join(" ")).toMatch(/boosting/);
    expect(det.join(" ")).toMatch(/moving/);
  });
});

describe("enforcePackageCharacterLimit", () => {
  it("leaves compliant packages alone", async () => {
    const stmts = [
      "Led 5-mbr team overhauling network, cut downtime 90%, boosting readiness.",
    ];
    const result = await enforcePackageCharacterLimit(stmts, 350);
    expect(result.stillOver).toBe(false);
    expect(result.method).toBe("none");
    expect(result.statements[0]).toBe(stmts[0]);
  });

  it("never truncates a two-statement package when no LLM is available", async () => {
    const before = combinedStatementLength([OVER_A, OVER_B]);
    expect(before).toBeGreaterThan(350);

    const result = await enforcePackageCharacterLimit([OVER_A, OVER_B], 350, {
      maxAttempts: 2,
    });

    expect(result.statements).toHaveLength(2);
    expect(result.statements.every((s) => /[.!?]$/.test(s.trim()))).toBe(true);
    expect(result.statements.join(" ")).toMatch(/\$2M/);
    expect(result.statements.join(" ")).toMatch(/Commanded/);
    // Without an LLM, complete sentences may still be over — never cut to fake a fit
    if (result.combinedLength > 350) {
      expect(result.stillOver).toBe(true);
    }
  });

  it("never truncates a single over-long statement when no LLM is available", async () => {
    const long = `${OVER_A} ${OVER_B}`;
    expect(long.length).toBeGreaterThan(350);
    const result = await enforcePackageCharacterLimit([long], 350);
    expect(result.statements[0]).toMatch(/Commanded/);
    expect(result.statements[0].length).toBeGreaterThan(350);
    expect(result.stillOver).toBe(true);
  });
});

describe("splitJoinedStatements", () => {
  it("splits a two-sentence EPB package", () => {
    const joined = `${OVER_A.replace(/\.$/, ".")} ${OVER_B}`;
    const parts = splitJoinedStatements(joined);
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/Executed/);
    expect(parts[1]).toMatch(/Commanded/);
  });

  it("does not split U.S. abbreviations", () => {
    const text = "Led U.S. Air Force team rebuilding servers across the wing.";
    expect(splitJoinedStatements(text)).toEqual([text]);
  });
});

describe("enforceRevisionText", () => {
  it("keeps both complete sentences instead of cutting the second to fit 350", async () => {
    const v1 =
      "Executed a $2M network expansion, transitioning 9 joint units to resilient IT, doubling bandwidth & extending air picture over 2.2M sq mi, this action supported 24 kinetic strikes & 42 vessel interdictions, enhancing USSOUTHCOM readiness. Directed AFSOUTH's inaugural Cyber Coordination Center, servicing 10 sites, and crafted the framework that allowed AFCYBER to resolve 12 MAJCOM issues in under 24 hours, proving vital for SOUTHCOM OPs deployments.";
    expect(v1.length).toBeGreaterThan(350);
    const out = await enforceRevisionText(v1, 350);
    expect(out.text).toMatch(/\$2M/);
    expect(out.text).toMatch(/Cyber Coordination Center/);
    expect(parseStatement(out.text).hasTwoSentences).toBe(true);
    expect(out.stillOver).toBe(true);
    expect(out.text.length).toBeGreaterThan(350);
  });
});

describe("fillRevisionsTowardCap", () => {
  it("leaves short revisions unchanged when no model is provided", async () => {
    const short =
      "Led 5-mbr team overhauling network, cut downtime 90%. Directed cyber center for 10 sites.";
    expect(short.length).toBeLessThan(332);
    const out = await fillRevisionsTowardCap(
      `${OVER_A} ${OVER_B}`,
      [short],
      332,
      350,
      2,
      { model: undefined as never }
    );
    expect(out[0]).toBe(short);
    expect(parseStatement(out[0]).hasTwoSentences).toBe(true);
  });
});
