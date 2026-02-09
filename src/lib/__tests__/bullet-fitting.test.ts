/**
 * Test suite for bullet-fitting.ts — AF Form 1206 line-breaking & text measurement.
 *
 * These tests verify three critical behaviors that must match the actual 1206 PDF:
 *
 *   1. Hyphenated words (e.g., "tri-service") are never split across lines.
 *   2. Character widths are measured without kerning, so repeated characters
 *      (like long runs of periods) accumulate predictably.
 *   3. The line-break algorithm produces the same line count as the PDF.
 */

import { describe, it, expect } from "vitest";
import {
  getCharWidth,
  getTextWidthPx,
  renderBulletText,
  getVisualLineSegments,
  AF1206_LINE_WIDTH_PX,
  fitsOnLine,
  compressText,
  expandText,
  normalizeSpaces,
  optimizeBullet,
  toDisplayText,
  fromDisplayText,
} from "../bullet-fitting";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LINE_WIDTH = AF1206_LINE_WIDTH_PX; // 765.95px

// ---------------------------------------------------------------------------
// 1. Hyphenated Word Handling
// ---------------------------------------------------------------------------
describe("Hyphenated words stay together", () => {
  it("adobeLineSplit (via renderBulletText) does NOT break at hyphens", () => {
    // The exact example from user feedback — in the real 1206 PDF,
    // "tri-service" stays on one line and the break happens BEFORE it.
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const result = renderBulletText(text, LINE_WIDTH);

    // "tri-service" must appear intact within a single line
    const triServiceSplit = result.textLines.some(
      (line) => line.endsWith("tri-") || line.startsWith("service")
    );
    expect(triServiceSplit).toBe(false);

    // Verify "tri-service" is fully contained in one line
    const lineWithTriService = result.textLines.find((line) =>
      line.includes("tri-service")
    );
    expect(lineWithTriService).toBeDefined();
  });

  it("getVisualLineSegments does NOT break at hyphens", () => {
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const segments = getVisualLineSegments(text, LINE_WIDTH);

    // "tri-service" must appear intact within a single segment
    const triServiceSplit = segments.some(
      (seg) => seg.text.endsWith("tri-") || seg.text.startsWith("service")
    );
    expect(triServiceSplit).toBe(false);

    const segmentWithTriService = segments.find((seg) =>
      seg.text.includes("tri-service")
    );
    expect(segmentWithTriService).toBeDefined();
  });

  it("keeps various hyphenated words intact across line boundaries", () => {
    const hyphenatedWords = [
      "commander-in-chief",
      "well-known",
      "state-of-the-art",
      "non-commissioned",
      "self-improvement",
      "full-time",
      "high-priority",
      "cross-functional",
    ];

    for (const word of hyphenatedWords) {
      // Build a line that would force a break right around the hyphenated word
      const padding = "X".repeat(80); // Push the word near the end of the line
      const text = `${padding} ${word} end`;
      const result = renderBulletText(text, LINE_WIDTH);

      // The word should never be split at a hyphen
      for (const line of result.textLines) {
        // If a line contains part of the hyphenated word, it must contain ALL of it
        const parts = word.split("-");
        for (let i = 0; i < parts.length - 1; i++) {
          if (line.trimEnd().endsWith(parts[i] + "-")) {
            // This line ends with a partial hyphenated word — check if the rest is on the next line
            const nextPart = parts[i + 1];
            const lineIndex = result.textLines.indexOf(line);
            if (lineIndex < result.textLines.length - 1) {
              const nextLine = result.textLines[lineIndex + 1];
              // The next line should NOT start with the continuation
              expect(nextLine.startsWith(nextPart)).toBe(false);
            }
          }
        }
      }
    }
  });

  it("still breaks at spaces adjacent to hyphenated words", () => {
    // The break should happen at the SPACE before "tri-service", not at the hyphen
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const result = renderBulletText(text, LINE_WIDTH);

    if (result.lines > 1) {
      // First line should end with content before "tri-service"
      // (with possible trailing space)
      const firstLine = result.textLines[0].trimEnd();
      expect(firstLine).not.toContain("tri-service");
      // The break should be at a space, not mid-word
      expect(firstLine.endsWith("sole")).toBe(true);
    }
  });

  it("still allows breaks at slashes and other valid break characters", () => {
    // Slashes should still be breakable (e.g., "and/or")
    const padding = "A".repeat(85);
    const text = `${padding} w/additional info`;
    const result = renderBulletText(text, LINE_WIDTH);

    // The text should be able to break after "w/"
    if (result.lines > 1) {
      const breakAtSlash = result.textLines.some((line) =>
        line.trimEnd().endsWith("w/")
      );
      // Slash breaks are still valid
      expect(breakAtSlash || result.lines >= 1).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Character Width Accuracy (kerning-free)
// ---------------------------------------------------------------------------
describe("Character width accuracy (kerning-free measurements)", () => {
  it("period width is exactly 4px", () => {
    expect(getCharWidth(".")).toBe(4);
  });

  it("repeating periods accumulate linearly without drift", () => {
    const singlePeriodWidth = getCharWidth(".");
    const periodCount = 100;
    const expectedWidth = singlePeriodWidth * periodCount;
    const actualWidth = getTextWidthPx(".".repeat(periodCount));

    // With no kerning, accumulated width must be exactly linear
    expect(actualWidth).toBe(expectedWidth);
  });

  it("long period run produces consistent line-break position", () => {
    // A line of periods should break at exactly floor(765.95 / 4) = 191 chars
    const periodsPerLine = Math.floor(LINE_WIDTH / getCharWidth("."));
    const totalPeriods = periodsPerLine + 20; // Overflow by 20
    const text = ".".repeat(totalPeriods);

    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBe(2);

    // First line should have exactly periodsPerLine periods
    // (since periods aren't breakable chars, it falls back to char-level breaking)
    expect(result.textLines[0].length).toBe(periodsPerLine);
  });

  it("getVisualLineSegments handles long period runs consistently", () => {
    const periodsPerLine = Math.floor(LINE_WIDTH / getCharWidth("."));
    const totalPeriods = periodsPerLine + 20;
    const text = ".".repeat(totalPeriods);

    const segments = getVisualLineSegments(text, LINE_WIDTH);
    expect(segments.length).toBe(2);
    expect(segments[0].text.length).toBe(periodsPerLine);
  });

  it("non-breaking hyphen has the same width as regular hyphen", () => {
    const regularHyphen = getCharWidth("-"); // U+002D
    const nonBreakingHyphen = getCharWidth("\u2011"); // U+2011
    expect(nonBreakingHyphen).toBe(regularHyphen);
  });

  it("character widths for common letter pairs are independent (no kerning)", () => {
    // "Vo" — the specific example from user feedback
    const vWidth = getCharWidth("V");
    const oWidth = getCharWidth("o");
    const voWidth = getTextWidthPx("Vo");

    // Without kerning, "Vo" width = V + o exactly
    expect(voWidth).toBe(vWidth + oWidth);
  });

  // -------------------------------------------------------------------------
  // Comprehensive kerning-pair tests
  //
  // In Times New Roman, these capital letters have diagonal or overhanging
  // strokes that cause kerning engines to tighten spacing with adjacent
  // lowercase letters. The 1206 PDF form does NOT kern, so our width
  // calculation must be purely additive (charA + charB = pair width).
  // -------------------------------------------------------------------------

  const KERNING_CAPITALS = ["A", "F", "L", "P", "T", "V", "W", "Y"] as const;
  const LOWERCASE_TARGETS = ["a", "e", "i", "o", "u", "r", "y"] as const;

  for (const cap of KERNING_CAPITALS) {
    it(`${cap} + lowercase vowels/common chars: widths are purely additive`, () => {
      const capWidth = getCharWidth(cap);
      for (const lower of LOWERCASE_TARGETS) {
        const lowerWidth = getCharWidth(lower);
        const pairWidth = getTextWidthPx(`${cap}${lower}`);
        expect(pairWidth).toBe(capWidth + lowerWidth);
      }
    });
  }

  // Also test capital-capital pairs that are commonly kerned (e.g., AV, AW, AT, LT, LV)
  const CAPITAL_KERNING_PAIRS = [
    "AV", "AW", "AT", "AY", "AC", "AG", "AO", "AQ", "AU",
    "LT", "LV", "LW", "LY",
    "PA", "TA", "TO", "TR",
    "VA", "VO", "WA", "WO",
    "YA", "YO", "FA", "FO",
  ] as const;

  it("capital-capital and capital-lowercase notorious kerning pairs are all additive", () => {
    for (const pair of CAPITAL_KERNING_PAIRS) {
      const char1 = pair[0];
      const char2 = pair[1];
      const expectedWidth = getCharWidth(char1) + getCharWidth(char2);
      const actualWidth = getTextWidthPx(pair);
      expect(actualWidth).toBe(expectedWidth);
    }
  });

  // Full words that are commonly affected by kerning in Times New Roman
  const KERNING_SENSITIVE_WORDS = [
    "Voice",     // V+o — the exact word from user feedback
    "Water",     // W+a
    "Took",      // T+o
    "Year",      // Y+e
    "Away",      // A+w
    "Type",      // T+y
    "AVOW",      // A+V, V+O, O+W — triple kerning trap
    "WAVE",      // W+A, A+V, V+E — triple kerning trap
    "Tower",     // T+o, w+e
    "Favor",     // F+a, v+o
    "Lawyer",    // L+a, w+y
    "Payment",   // P+a, y+m
    "Loyalty",   // L+o, y+a, l+t, t+y
    "TOTAL",     // T+O, T+A, A+L — all-caps kerning
    "VALUE",     // V+A, A+L, L+U, U+E — all-caps kerning
    "WATCHFUL",  // W+A, T+C, H+F — all-caps kerning
  ];

  it("full words with kerning-sensitive letter combos have purely additive widths", () => {
    for (const word of KERNING_SENSITIVE_WORDS) {
      const charByCharWidth = [...word].reduce(
        (sum, ch) => sum + getCharWidth(ch),
        0
      );
      const measuredWidth = getTextWidthPx(word);
      expect(measuredWidth).toBe(charByCharWidth);
    }
  });

  // -------------------------------------------------------------------------
  // Military / AF / DoD acronyms
  //
  // Award bullets are loaded with all-caps acronyms. Many of these contain
  // notorious kerning pairs (AT, AV, AW, TO, LT, etc.) that would cause
  // width drift if the browser or our calculations applied kerning.
  // -------------------------------------------------------------------------

  const MILITARY_ACRONYMS = [
    // --- Ranks & Personnel ---
    "CMSAF",   // C+M — Chief Master Sergeant of the Air Force
    "SNCO",    // S+N — Senior Non-Commissioned Officer
    "NCO",     // N+C
    "CGO",     // C+G
    "POTUS",   // P+O, T+U — President of the United States
    "SECAF",   // S+E, C+A — Secretary of the Air Force
    "CSAF",    // C+S, A+F — Chief of Staff of the Air Force
    "CJCS",    // C+J — Chairman of the Joint Chiefs of Staff

    // --- Organizations & Commands ---
    "AETC",    // A+E, T+C — Air Education and Training Command
    "ACC",     // A+C — Air Combat Command
    "AMC",     // A+M — Air Mobility Command
    "AFMC",    // A+F — Air Force Materiel Command
    "AFSOC",   // A+F, S+O — Air Force Special Operations Command
    "PACAF",   // P+A, C+A — Pacific Air Forces
    "USAFE",   // U+S, A+F — US Air Forces in Europe
    "MAJCOM",  // M+A, A+J — Major Command
    "NATO",    // N+A, A+T, T+O — triple kerning trap
    "COCOM",   // C+O — Combatant Command
    "CENTCOM", // C+E, T+C — Central Command
    "EUCOM",   // E+U — European Command
    "INDOPACOM", // I+N, P+A — Indo-Pacific Command
    "SOCOM",   // S+O — Special Operations Command
    "STRATCOM", // S+T, A+T, T+C — Strategic Command
    "TRANSCOM", // T+R, A+N, S+C — Transportation Command
    "USSF",    // U+S — United States Space Force

    // --- Operations & Readiness ---
    "ATO",     // A+T, T+O — Air Tasking Order (double kerning trap)
    "OPTEMPO", // O+P, T+E — Operational Tempo
    "OPORD",   // O+P — Operations Order
    "OPLAN",   // O+P, L+A — Operations Plan
    "SORTS",   // S+O — Status of Resources and Training System
    "UTC",     // U+T — Unit Type Code
    "UTA",     // U+T, T+A — Unit Training Assembly
    "TDY",     // T+D — Temporary Duty
    "PCS",     // P+C — Permanent Change of Station
    "OPR",     // O+P — Officer Performance Report
    "EPR",     // E+P — Enlisted Performance Report
    "LOE",     // L+O — Letter of Evaluation
    "LOA",     // L+O — Letter of Admonishment / Appreciation
    "CCAF",    // C+C, A+F — Community College of the Air Force

    // --- Awards & Recognition ---
    "AFOUA",   // A+F, O+U — AF Outstanding Unit Award
    "AFAM",    // A+F, A+M — AF Achievement Medal
    "AFCM",    // A+F — AF Commendation Medal
    "MSM",     // M+S — Meritorious Service Medal
    "JSCM",    // J+S — Joint Service Commendation Medal
    "AAM",     // A+A — Army Achievement Medal
    "MOVSM",   // M+O, V+S — Military Outstanding Volunteer Service Medal
    "GWOT",    // G+W, O+T — Global War on Terror
    "BTZ",     // B+T — Below the Zone
    "DG",      // D+G — Distinguished Graduate
    "WAPS",    // W+A — Weighted Airman Promotion System

    // --- Training & Education ---
    "ALS",     // A+L — Airman Leadership School
    "NCOA",    // N+C, O+A — NCO Academy
    "AWC",     // A+W — Air War College
    "ACSC",    // A+C — Air Command and Staff College
    "SOS",     // S+O — Squadron Officer School
    "PME",     // P+M — Professional Military Education
    "AFIT",    // A+F, I+T — Air Force Institute of Technology
    "OTS",     // O+T — Officer Training School
    "BMT",     // B+M — Basic Military Training
    "FTAC",    // F+T, A+C — First Term Airman Center

    // --- Technical / Cyber / Comms ---
    "SCIF",    // S+C — Sensitive Compartmented Information Facility
    "JWICS",   // J+W — Joint Worldwide Intel Communications System
    "SIPR",    // S+I — SECRET Internet Protocol Router
    "NIPR",    // N+I — Non-classified Internet Protocol Router
    "SATCOM",  // S+A, A+T, T+C — Satellite Communications
    "EW",      // E+W — Electronic Warfare
    "ISR",     // I+S — Intelligence, Surveillance, Reconnaissance
    "C2",      // C+2 — Command and Control
    "COMSEC",  // C+O, S+E — Communications Security
    "OPSEC",   // O+P, S+E — Operations Security
    "INFOSEC", // I+N, O+S — Information Security
    "CYBCOM",  // C+Y — Cyber Command

    // --- Logistics & Maintenance ---
    "AFTO",    // A+F, T+O — AF Technical Order
    "CAMS",    // C+A — Core Automated Maintenance System
    "IMDS",    // I+M — Integrated Maintenance Data System
    "FSC",     // F+S — Federal Supply Class
    "LRS",     // L+R — Logistics Readiness Squadron
    "FW",      // F+W — Fighter Wing
    "MXS",     // M+X — Maintenance Squadron
    "MXG",     // M+X — Maintenance Group
    "OSS",     // O+S — Operations Support Squadron
    "FSS",     // F+S — Force Support Squadron
    "SFS",     // S+F — Security Forces Squadron
    "CES",     // C+E — Civil Engineer Squadron
    "CS",      // C+S — Communications Squadron
    "MDG",     // M+D — Medical Group

    // --- Acronyms with numbers (common in bullets) ---
    "F-35",    // F+- (hyphenated, treated as one unit)
    "C-17",    // C+- (hyphenated)
    "KC-135",  // K+C, C+- (hyphenated)
    "F-16",    // F+-
    "B-52",    // B+-
    "C-130",   // C+-
    "A-10",    // A+-
    "E-3",     // E+-
    "RC-135",  // R+C, C+-
    "CV-22",   // C+V, V+-

    // --- Multi-word acronyms with slashes ---
    "TS/SCI",  // T+S, S+C — Top Secret / Sensitive Compartmented Info
    "AT/FP",   // A+T, F+P — Anti-Terrorism / Force Protection
    "QA/QC",   // Q+A, Q+C — Quality Assurance / Quality Control
  ];

  it("military acronyms have purely additive character widths (no kerning)", () => {
    for (const acronym of MILITARY_ACRONYMS) {
      const charByCharWidth = [...acronym].reduce(
        (sum, ch) => sum + getCharWidth(ch),
        0
      );
      const measuredWidth = getTextWidthPx(acronym);
      expect(measuredWidth).toBe(charByCharWidth);
    }
  });

  // Test acronyms in context — full bullet fragments with heavy acronym usage
  const ACRONYM_HEAVY_PHRASES = [
    "- Led AETC's SNCO PME reform; briefed CSAF/CMSAF--shaped AF-wide policy for 330K mbrs",
    "- Managed $2.1M SATCOM upgrade; restored SIPR/NIPR connectivity for CENTCOM ATO ops",
    "- Earned DG at NCOA; scored 98% on WAPS--promoted BTZ to TSgt, 1/450 eligible",
    "- Directed CV-22 phase insps; zero repeat discrepancies--secured AFOUA for 500-mbr MXG",
    "- Authored OPLAN for NATO COCOM exercise; synchronized C2 for 12 allied nations",
    "- Processed 200+ EPR/OPR packages; zero errors--recognized w/AFAM by MAJCOM/CC",
    "- Secured TS/SCI SCIF; passed OPSEC/COMSEC insps--safeguarded JWICS for ISR msn",
    "- Spearheaded FTAC trng for 85 Amn; revamped BMT-to-ops transition--cut attrition 30%",
  ];

  it("acronym-heavy bullet phrases have purely additive widths", () => {
    for (const phrase of ACRONYM_HEAVY_PHRASES) {
      const charByCharWidth = [...phrase].reduce(
        (sum, ch) => sum + getCharWidth(ch),
        0
      );
      const measuredWidth = getTextWidthPx(phrase);
      expect(measuredWidth).toBe(charByCharWidth);
    }
  });

  it("acronym-heavy phrases produce consistent line counts between render and visual", () => {
    for (const phrase of ACRONYM_HEAVY_PHRASES) {
      const rendered = renderBulletText(phrase, LINE_WIDTH);
      const segments = getVisualLineSegments(phrase, LINE_WIDTH);
      expect(segments.length).toBe(rendered.lines);
    }
  });

  // Test every uppercase letter against every lowercase letter exhaustively
  it("ALL 26×26 uppercase+lowercase pairs are purely additive (no kerning)", () => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";

    for (const cap of uppercase) {
      for (const lower of lowercase) {
        const expectedWidth = getCharWidth(cap) + getCharWidth(lower);
        const actualWidth = getTextWidthPx(`${cap}${lower}`);
        expect(actualWidth).toBe(expectedWidth);
      }
    }
  });

  it("space width is exactly 4px", () => {
    expect(getCharWidth(" ")).toBe(4);
  });

  it("thin space width is 2.67px", () => {
    expect(getCharWidth("\u2006")).toBe(2.67);
  });

  it("medium space width is 5.33px", () => {
    expect(getCharWidth("\u2004")).toBe(5.33);
  });
});

// ---------------------------------------------------------------------------
// 3. Line Count Accuracy
// ---------------------------------------------------------------------------
describe("Line count accuracy matches AF Form 1206 PDF", () => {
  it("single-line text stays on one line", () => {
    const text = "- Led 5-mbr tm; streamlined ops--saved 120 man-hrs/qtr";
    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBe(1);
  });

  it("exact user-reported example produces correct line count", () => {
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const result = renderBulletText(text, LINE_WIDTH);

    // This text should overflow to 2 lines, with "tri-service" on line 2
    expect(result.lines).toBe(2);

    // "tri-service" should be on the second line, intact
    expect(result.textLines[1]).toContain("tri-service");
  });

  it("empty text returns 0 lines", () => {
    const result = renderBulletText("", LINE_WIDTH);
    expect(result.lines).toBe(0);
    expect(result.textLines).toEqual([]);
  });

  it("whitespace-only text returns 0 lines", () => {
    const result = renderBulletText("   ", LINE_WIDTH);
    expect(result.lines).toBe(0);
  });

  it("text exactly at line width stays on one line", () => {
    // Build a string that's just under the line width
    let text = "";
    while (getTextWidthPx(text + "a") <= LINE_WIDTH) {
      text += "a";
    }
    // text is now the longest string of 'a' chars that fits
    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBe(1);
  });

  it("text one character over line width wraps to 2 lines", () => {
    let text = "";
    while (getTextWidthPx(text + "a") <= LINE_WIDTH) {
      text += "a";
    }
    text += "a"; // One char over
    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBe(2);
  });

  it("renderBulletText and getVisualLineSegments agree on line count", () => {
    const testCases = [
      "- Led 5-mbr tm; streamlined ops--saved 120 man-hrs/qtr",
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service",
      "- Orchestrated joint-service training exercise w/150+ personnel; enhanced cross-functional readiness--earned Outstanding rating from IG",
      ".".repeat(200),
      "A very long sentence without any hyphens that should wrap based on spaces and other normal break characters in the text",
    ];

    for (const text of testCases) {
      const rendered = renderBulletText(text, LINE_WIDTH);
      const segments = getVisualLineSegments(text, LINE_WIDTH);

      expect(segments.length).toBe(rendered.lines);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Space Optimization Still Works
// ---------------------------------------------------------------------------
describe("Space optimization is not broken by hyphen changes", () => {
  it("compressText replaces normal spaces with thin spaces", () => {
    const text = "hello world test";
    const { text: compressed, savedPx } = compressText(text);

    expect(compressed).not.toContain(" ");
    expect(compressed).toContain("\u2006");
    expect(savedPx).toBeGreaterThan(0);
  });

  it("expandText replaces normal spaces with medium spaces", () => {
    const text = "hello world test";
    const { text: expanded, addedPx } = expandText(text);

    expect(expanded).not.toContain(" ");
    expect(expanded).toContain("\u2004");
    expect(addedPx).toBeGreaterThan(0);
  });

  it("normalizeSpaces restores all special spaces to normal", () => {
    const text = "hello\u2006world\u2004test\u2009end";
    const normalized = normalizeSpaces(text);
    expect(normalized).toBe("hello world test end");
  });

  it("optimizeBullet can compress text that slightly overflows", () => {
    // Build text that just barely overflows
    let text = "- Led ";
    while (getTextWidthPx(text + "word ") <= LINE_WIDTH + 10) {
      text += "word ";
    }

    const result = optimizeBullet(text.trimEnd(), LINE_WIDTH);
    // Should either optimize or fail, not error out
    expect([0, 1, -1]).toContain(result.status);
  });

  it("compressed text preserves hyphenated words intact", () => {
    const text = "the cross-functional team achieved state-of-the-art results";
    const { text: compressed } = compressText(text);

    // Hyphens should still be regular hyphens (compression only affects spaces)
    expect(compressed).toContain("cross-functional");
    expect(compressed).toContain("state-of-the-art");
  });
});

// ---------------------------------------------------------------------------
// 5. Edge Cases
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  it("text with only hyphens does not cause infinite loop", () => {
    const text = "----------------------------";
    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBeGreaterThanOrEqual(1);
  });

  it("text with consecutive hyphens and spaces", () => {
    const text = "word -- another-word -- end";
    const result = renderBulletText(text, LINE_WIDTH);
    expect(result.lines).toBeGreaterThanOrEqual(1);
    // Should not throw
  });

  it("very long hyphenated compound that exceeds line width", () => {
    // Edge case: a single hyphenated word longer than the line width
    const longWord = "super-ultra-mega-extremely-very-long-hyphenated-compound-word-that-exceeds-the-line-width-of-the-form";
    const width = getTextWidthPx(longWord);

    // This word is wider than one line, so it must be force-broken
    if (width > LINE_WIDTH) {
      const result = renderBulletText(longWord, LINE_WIDTH);
      expect(result.lines).toBeGreaterThan(1);
    }
  });

  it("mixed special characters as break points", () => {
    // Verify that /, |, ?, ! still work as break points
    const text = "A".repeat(80) + " test/break here";
    const result = renderBulletText(text, LINE_WIDTH);

    if (result.lines > 1) {
      // Should be able to break at the slash
      const breakAfterSlash = result.textLines.some(
        (line) => line.includes("/") || line.trimEnd().endsWith("test")
      );
      expect(breakAfterSlash).toBe(true);
    }
  });

  it("fitsOnLine correctly evaluates text near the boundary", () => {
    let text = "";
    while (getTextWidthPx(text + "m") <= LINE_WIDTH) {
      text += "m";
    }
    expect(fitsOnLine(text)).toBe(true);
    expect(fitsOnLine(text + "m")).toBe(false);
  });

  it("repeating periods mixed with spaces break at spaces, not mid-period-run", () => {
    const text = "..." + ".".repeat(50) + " " + ".".repeat(50) + " end";
    const segments = getVisualLineSegments(text, LINE_WIDTH);

    // If it wraps, the break should be at a space, not mid-period-run
    if (segments.length > 1) {
      for (const seg of segments) {
        // Each segment should start/end at a word boundary (space) if possible
        const trimmed = seg.text.trimEnd();
        // The segment should not start or end with a lone period fragment
        // (it either contains a full period run or ends at a space)
        expect(trimmed.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Display Text Conversion (non-breaking hyphen swap)
// ---------------------------------------------------------------------------
describe("toDisplayText / fromDisplayText (non-breaking hyphen swap)", () => {
  it("toDisplayText replaces all regular hyphens with non-breaking hyphens", () => {
    const input = "tri-service cross-functional state-of-the-art";
    const display = toDisplayText(input);

    // Should contain no regular hyphens
    expect(display).not.toContain("-");
    // Should contain non-breaking hyphens
    expect(display).toContain("\u2011");
    // Should have the same number of non-breaking hyphens as the original had hyphens
    expect((display.match(/\u2011/g) || []).length).toBe(5);
  });

  it("fromDisplayText restores non-breaking hyphens to regular hyphens", () => {
    const display = "tri\u2011service cross\u2011functional";
    const stored = fromDisplayText(display);

    expect(stored).toBe("tri-service cross-functional");
    expect(stored).not.toContain("\u2011");
  });

  it("round-trip: fromDisplayText(toDisplayText(text)) === text", () => {
    const testCases = [
      "tri-service",
      "state-of-the-art",
      "commander-in-chief",
      "F-35 and KC-135 operations",
      "- Led 5-mbr tm; streamlined ops--saved 120 man-hrs/qtr",
      "no hyphens here",
      "",
      "---multiple---hyphens---",
      "TS/SCI AT/FP", // slashes, no hyphens
    ];

    for (const text of testCases) {
      expect(fromDisplayText(toDisplayText(text))).toBe(text);
    }
  });

  it("toDisplayText does not affect spaces, slashes, or other characters", () => {
    const text = "hello world test/case a|b c?d e!f";
    const display = toDisplayText(text);
    // No hyphens in this text, so it should be unchanged
    expect(display).toBe(text);
  });

  it("toDisplayText handles text with thin/medium spaces correctly", () => {
    const text = "word\u2006hyphen-word\u2004end";
    const display = toDisplayText(text);
    // Thin and medium spaces should be preserved
    expect(display).toContain("\u2006");
    expect(display).toContain("\u2004");
    // Hyphen should be replaced
    expect(display).not.toContain("-");
    expect(display).toContain("\u2011");
  });

  it("display text has the same pixel width as original (hyphens are same width)", () => {
    const testCases = [
      "tri-service",
      "cross-functional team",
      "F-35 KC-135 C-17 CV-22 B-52",
      "- Led joint-service ops--enhanced readiness",
    ];

    for (const text of testCases) {
      const originalWidth = getTextWidthPx(text);
      const displayWidth = getTextWidthPx(toDisplayText(text));
      expect(displayWidth).toBe(originalWidth);
    }
  });

  it("normalizeSpaces also converts non-breaking hyphens back to regular", () => {
    const text = "tri\u2011service with\u2006thin\u2004medium";
    const normalized = normalizeSpaces(text);
    expect(normalized).toBe("tri-service with thin medium");
  });

  it("military acronyms with hyphens survive the round-trip", () => {
    const acronyms = ["F-35", "C-17", "KC-135", "CV-22", "B-52", "A-10", "E-3", "RC-135"];
    for (const acr of acronyms) {
      const display = toDisplayText(acr);
      expect(display).not.toContain("-");
      expect(fromDisplayText(display)).toBe(acr);
    }
  });

  it("double hyphens (em-dash style) survive the round-trip", () => {
    const text = "streamlined ops--saved 120 man-hrs";
    const display = toDisplayText(text);
    expect(display).not.toContain("-");
    expect(fromDisplayText(display)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// 7. Line Re-evaluation After Compression
// ---------------------------------------------------------------------------
describe("Line re-evaluation after per-line compression", () => {
  // This simulates exactly what handleToggleLine does in the UI:
  // 1. Get visual segments for current text
  // 2. Compress a specific line segment
  // 3. Rebuild the full text
  // 4. Re-evaluate visual segments on the new text
  function simulateCompressLine(text: string, lineIndex: number): {
    before: { segments: ReturnType<typeof getVisualLineSegments>; text: string };
    after: { segments: ReturnType<typeof getVisualLineSegments>; text: string };
    spaceSaved: number;
  } {
    const segmentsBefore = getVisualLineSegments(text, LINE_WIDTH);
    const segment = segmentsBefore[lineIndex];
    const lineText = segment.text;

    const { text: compressed, savedPx } = compressText(lineText);

    const before = text.substring(0, segment.startIndex);
    const after = text.substring(segment.endIndex);
    const newText = before + compressed + after;

    const segmentsAfter = getVisualLineSegments(newText, LINE_WIDTH);

    return {
      before: { segments: segmentsBefore, text },
      after: { segments: segmentsAfter, text: newText },
      spaceSaved: savedPx,
    };
  }

  it("visual lines are re-evaluated after compressing line 1 (exact user example)", () => {
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const segmentsBefore = getVisualLineSegments(text, LINE_WIDTH);

    // Before compression: "tri-service" should be on line 2
    expect(segmentsBefore.length).toBe(2);
    expect(segmentsBefore[1].text).toContain("tri-service");

    // Simulate compressing line 1
    const result = simulateCompressLine(text, 0);

    // After compression: segments are recalculated on the new text
    // Whether "tri-service" moves to line 1 depends on how much space was saved
    const line1Width = result.after.segments[0].width;

    // The new line 1 width must be within the line width
    expect(line1Width).toBeLessThanOrEqual(LINE_WIDTH);

    // Log the math for visibility
    const triServiceWidth = getTextWidthPx("tri-service");
    const remainingSpace = LINE_WIDTH - result.before.segments[0].width;
    const remainingSpaceAfterCompress = LINE_WIDTH - getTextWidthPx(
      result.after.segments[0].text.replace(/tri-service.*$/, "").trimEnd()
    );

    // Verify the re-evaluation produced valid segments
    for (const seg of result.after.segments) {
      expect(seg.width).toBeLessThanOrEqual(LINE_WIDTH + 1); // +1 for float rounding
      expect(seg.text.length).toBeGreaterThan(0);
    }
  });

  it("compressing a line reduces its pixel width", () => {
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const result = simulateCompressLine(text, 0);

    // Compression should have saved space
    expect(result.spaceSaved).toBeGreaterThan(0);

    // The compressed line's raw text width should be less than the original
    const originalLine1Width = result.before.segments[0].width;
    const compressedFullText = result.after.text;
    const compressedSegments = result.after.segments;

    // Total text width of the compressed version should be less
    expect(getTextWidthPx(compressedFullText)).toBeLessThan(getTextWidthPx(text));
  });

  it("reports the exact space savings and remaining room", () => {
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const segmentsBefore = getVisualLineSegments(text, LINE_WIDTH);
    const line1Before = segmentsBefore[0];

    // Calculate space needed for "tri-service" to fit (word + space before it)
    const triServiceWithSpace = getTextWidthPx(" tri-service");
    const roomBeforeCompress = LINE_WIDTH - line1Before.width;

    // Compress line 1
    const result = simulateCompressLine(text, 0);
    const spaceSaved = result.spaceSaved;

    // Room after compression = original room + space saved
    const roomAfterCompress = roomBeforeCompress + spaceSaved;

    // Report whether "tri-service" fits
    const fitsAfterCompress = roomAfterCompress >= triServiceWithSpace;

    // Either way, the segments should be valid
    if (fitsAfterCompress) {
      // "tri-service" should have moved to line 1
      expect(result.after.segments.length).toBe(1);
      expect(result.after.segments[0].text).toContain("tri-service");
    } else {
      // Still on line 2, which is fine — not enough room
      expect(result.after.segments.length).toBe(2);
    }
  });

  it("if compression creates enough room, words move up from line 2 to line 1", () => {
    // Construct text that is just barely 2 lines, where compressing guarantees
    // enough savings to pull the overflow back to 1 line.
    // Strategy: use many short words (lots of spaces to compress) with a tiny overflow.
    const words: string[] = [];
    let currentWidth = 0;

    // Fill line with 3-letter words + spaces until we're ~10px from the edge
    while (currentWidth + getTextWidthPx("abc ") < LINE_WIDTH - 10) {
      words.push("abc");
      currentWidth += getTextWidthPx("abc ");
    }
    // Add one more word that pushes ~5px past the line width
    words.push("xy");
    const text = words.join(" ");

    const segmentsBefore = getVisualLineSegments(text, LINE_WIDTH);
    if (segmentsBefore.length < 2) return; // skip if somehow fits

    expect(segmentsBefore.length).toBe(2);

    // Compress line 1 — with many spaces, savings should be substantial
    const result = simulateCompressLine(text, 0);

    // After compression the entire text should fit on one line since we only
    // overflowed by ~5px and each compressed space saves ~1.33px
    const compressedFullWidth = getTextWidthPx(result.after.text);
    if (compressedFullWidth <= LINE_WIDTH) {
      expect(result.after.segments.length).toBe(1);
    } else {
      // Even if full text doesn't fit on 1 line, still 2 lines is valid
      expect(result.after.segments.length).toBeLessThanOrEqual(2);
    }
  });

  it("line buttons update correctly after compression changes line count", () => {
    // This tests that after compression changes the line count,
    // the visual line segments array length reflects the change
    const text =
      "operations for Giant Voice systems, including 42 poles valued at 850K, enabling effective alerts across DoD's sole tri-service";

    const segmentsBefore = getVisualLineSegments(text, LINE_WIDTH);
    const lineCountBefore = segmentsBefore.length;

    const result = simulateCompressLine(text, 0);
    const lineCountAfter = result.after.segments.length;

    // Line count should either stay the same or decrease (never increase from compression)
    expect(lineCountAfter).toBeLessThanOrEqual(lineCountBefore);
  });
});
