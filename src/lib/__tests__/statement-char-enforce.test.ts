import { describe, expect, it } from "vitest";
import { parseStatement } from "@/lib/sentence-utils";
import {
  applyDeterministicCompress,
  combineStatementsForDisplay,
  combinedStatementLength,
  enforcePackageCharacterLimit,
  enforceRevisionText,
  splitJoinedStatements,
  trimToMaxAtClauseBoundary,
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
});

describe("trimToMaxAtClauseBoundary", () => {
  it("cuts at commas to fit max", () => {
    const long =
      "Led team rebuilding servers, installed 47 racks, cut downtime 90%, saved $2M, boosting readiness across the wing";
    const out = trimToMaxAtClauseBoundary(long, 80);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain("Led team");
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

  it("deterministically shrinks an over-limit two-statement package without LLM", async () => {
    const before = combinedStatementLength([OVER_A, OVER_B]);
    expect(before).toBeGreaterThan(350);

    const result = await enforcePackageCharacterLimit([OVER_A, OVER_B], 350, {
      // no model — deterministic + trim only
      maxAttempts: 2,
    });

    expect(result.combinedLength).toBeLessThanOrEqual(350);
    expect(result.stillOver).toBe(false);
    expect(result.wasAdjusted).toBe(true);
    expect(["deterministic", "trim_fallback"]).toContain(result.method);
    expect(result.statements).toHaveLength(2);
    // Metrics should survive compression
    expect(result.statements.join(" ")).toMatch(/\$2M/);
    expect(result.statements.join(" ")).toMatch(/24/);
  });

  it("trims a single over-long statement without LLM", async () => {
    const long = `${OVER_A} ${OVER_B}`;
    expect(long.length).toBeGreaterThan(350);
    const result = await enforcePackageCharacterLimit([long], 350);
    expect(result.statements[0].length).toBeLessThanOrEqual(350);
    expect(result.stillOver).toBe(false);
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
  it("fits the user's over-limit two-sentence revise example under 350 without LLM", async () => {
    const v1 =
      "Executed a $2M network expansion, transitioning 9 joint units to resilient IT, doubling bandwidth & extending air picture over 2.2M sq mi, this action supported 24 kinetic strikes & 42 vessel interdictions, enhancing USSOUTHCOM readiness. Directed AFSOUTH's inaugural Cyber Coordination Center, servicing 10 sites, and crafted the framework that allowed AFCYBER to resolve 12 MAJCOM issues in under 24 hours, proving vital for SOUTHCOM OPs deployments.";
    expect(v1.length).toBeGreaterThan(350);
    const out = await enforceRevisionText(v1, 350);
    expect(out.length).toBeLessThanOrEqual(350);
    expect(out).toMatch(/\$2M/);
    expect(parseStatement(out).hasTwoSentences).toBe(true);
  });
});
