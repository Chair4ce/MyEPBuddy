/**
 * Comprehensive test suite for the Sensitive Data Scanner.
 *
 * Covers every pattern category:
 *   PII: SSN, phone, email, DoD ID, DOB, street address
 *   Classification: TOP SECRET, TS/SCI, SECRET, CONFIDENTIAL, portion markings
 *   CUI: CUI/FOUO/NOFORN/ORCON markings, MGRS coords, lat/long, IP, MAC, .mil URLs
 *
 * Also tests: false-positive avoidance, redaction, summary output, and convenience wrappers.
 */

import { describe, it, expect } from "vitest";
import {
  scanForSensitiveData,
  scanStatementText,
  scanAccomplishmentsForLLM,
  scanTextForLLM,
  hasSensitiveData,
  redactSensitiveData,
  redactField,
  getScanSummary,
  type SensitiveMatch,
} from "../sensitive-data-scanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scan a single string and return matches */
function scan(text: string): SensitiveMatch[] {
  return scanForSensitiveData({ details: text });
}

/** Assert text triggers at least one match of the given type */
function expectMatch(text: string, type: string) {
  const matches = scan(text);
  const found = matches.some((m) => m.type === type);
  expect(found, `Expected "${type}" match in: "${text}"\nGot: ${JSON.stringify(matches.map(m => m.type))}`).toBe(true);
}

/** Assert text triggers NO matches of the given type */
function expectNoMatch(text: string, type: string) {
  const matches = scan(text);
  const found = matches.some((m) => m.type === type);
  expect(found, `Expected NO "${type}" match in: "${text}"\nGot: ${JSON.stringify(matches.map(m => ({ type: m.type, value: m.value })))}`).toBe(false);
}

/** Assert text is completely clean */
function expectClean(text: string) {
  const matches = scan(text);
  expect(matches, `Expected clean text but found: ${JSON.stringify(matches.map(m => ({ type: m.type, value: m.value })))}`).toHaveLength(0);
}

// ===========================================================================
// PII PATTERNS
// ===========================================================================

describe("PII Detection", () => {
  // -----------------------------------------------------------------------
  // SSN
  // -----------------------------------------------------------------------
  describe("Social Security Numbers", () => {
    it("detects SSN with dashes", () => {
      expectMatch("My SSN is 123-45-6789", "ssn");
    });

    it("detects SSN with dashes in middle of text", () => {
      expectMatch("Please reference 234-56-7890 for processing", "ssn");
    });

    it("rejects invalid area 000", () => {
      expectNoMatch("000-12-3456", "ssn");
    });

    it("rejects invalid area 666", () => {
      expectNoMatch("666-12-3456", "ssn");
    });

    it("rejects area >= 900", () => {
      expectNoMatch("900-12-3456", "ssn");
      expectNoMatch("999-12-3456", "ssn");
    });

    it("rejects group 00", () => {
      expectNoMatch("123-00-6789", "ssn");
    });

    it("rejects serial 0000", () => {
      expectNoMatch("123-45-0000", "ssn");
    });

    it("detects 9-digit SSN with nearby context 'SSN'", () => {
      expectMatch("SSN: 123456789", "ssn");
    });

    it("detects 9-digit SSN with nearby context 'social security'", () => {
      expectMatch("Social Security Number 234567890", "ssn");
    });

    it("does NOT detect 9-digit number without SSN context", () => {
      expectNoMatch("The project code is 123456789", "ssn");
    });
  });

  // -----------------------------------------------------------------------
  // Phone numbers
  // -----------------------------------------------------------------------
  describe("Phone Numbers", () => {
    it("detects (XXX) XXX-XXXX format", () => {
      expectMatch("Call (703) 555-1234", "phone");
    });

    it("detects XXX-XXX-XXXX format", () => {
      expectMatch("Phone: 703-555-1234", "phone");
    });

    it("detects XXX.XXX.XXXX format", () => {
      expectMatch("Reach at 703.555.1234", "phone");
    });

    it("detects +1 XXX-XXX-XXXX format", () => {
      expectMatch("Mobile: +1 703-555-1234", "phone");
    });

    it("detects XXX XXX XXXX with spaces", () => {
      expectMatch("Phone 703 555 1234", "phone");
    });

    it("does NOT flag 10 consecutive digits without separators as phone", () => {
      // 10-digit number without separators shouldn't match phone (could match dod_id with context)
      expectNoMatch("Equipment serial 7035551234", "phone");
    });
  });

  // -----------------------------------------------------------------------
  // Email
  // -----------------------------------------------------------------------
  describe("Email Addresses", () => {
    it("detects standard email", () => {
      expectMatch("Contact john.doe@example.com for info", "email");
    });

    it("detects .mil email", () => {
      expectMatch("Send to john.doe@us.af.mil", "email");
    });

    it("detects email with plus addressing", () => {
      expectMatch("Email user+tag@domain.org", "email");
    });

    it("does NOT flag non-email text", () => {
      expectNoMatch("Led 50 Airmen in mission ops", "email");
    });
  });

  // -----------------------------------------------------------------------
  // DoD ID / EDIPI
  // -----------------------------------------------------------------------
  describe("DoD ID / EDIPI", () => {
    it("detects 10-digit number with 'DoD ID' context", () => {
      expectMatch("DoD ID: 1234567890", "dod_id");
    });

    it("detects 10-digit number with 'EDIPI' context", () => {
      expectMatch("EDIPI 1234567890 is assigned", "dod_id");
    });

    it("detects 10-digit number with 'CAC' context", () => {
      expectMatch("CAC card number 1234567890", "dod_id");
    });

    it("does NOT detect 10-digit number without context", () => {
      expectNoMatch("Saved $1234567890 in costs", "dod_id");
    });
  });

  // -----------------------------------------------------------------------
  // Date of Birth
  // -----------------------------------------------------------------------
  describe("Date of Birth", () => {
    it("detects 'DOB: MM/DD/YYYY'", () => {
      expectMatch("DOB: 03/15/1990", "dob");
    });

    it("detects 'date of birth MM-DD-YYYY'", () => {
      expectMatch("Date of birth: 03-15-1990", "dob");
    });

    it("detects 'born on MM/DD/YY'", () => {
      expectMatch("born on 03/15/90", "dob");
    });

    it("detects 'birthday MM/DD/YYYY'", () => {
      expectMatch("birthday 12/25/1985", "dob");
    });

    it("does NOT flag standalone dates without DOB context", () => {
      expectNoMatch("Completed on 03/15/2024", "dob");
    });
  });

  // -----------------------------------------------------------------------
  // Street Address
  // -----------------------------------------------------------------------
  describe("Street Addresses", () => {
    it("detects standard street address", () => {
      expectMatch("Lives at 123 Main Street", "address");
    });

    it("detects address with Ave", () => {
      expectMatch("Office at 456 Oak Avenue", "address");
    });

    it("detects address with Blvd", () => {
      expectMatch("Located at 789 Sunset Blvd", "address");
    });

    it("detects address with Dr", () => {
      expectMatch("Report to 100 Pine Dr", "address");
    });

    it("detects address with directional prefix", () => {
      expectMatch("Ship to 42 N Elm Street", "address");
    });

    it("detects address with multi-word street name", () => {
      expectMatch("Deployed from 1234 Fort Sam Houston Rd", "address");
    });

    it("does NOT flag random numbers next to words", () => {
      expectNoMatch("Led 50 Airmen in 12 missions", "address");
    });
  });
});

// ===========================================================================
// CLASSIFICATION MARKINGS
// ===========================================================================

describe("Classification Markings", () => {
  describe("Full classification levels", () => {
    it("detects TOP SECRET", () => {
      expectMatch("Document is TOP SECRET", "classification");
    });

    it("detects TS/SCI", () => {
      expectMatch("Access requires TS/SCI clearance info", "classification");
    });

    it("detects TS//SCI", () => {
      expectMatch("Marked TS//SCI per policy", "classification");
    });

    it("detects CONFIDENTIAL", () => {
      expectMatch("Classification: CONFIDENTIAL", "classification");
    });

    it("detects UNCLASSIFIED//FOUO", () => {
      expectMatch("Marked UNCLASSIFIED//FOUO", "classification");
    });
  });

  describe("SECRET keyword (with false-positive avoidance)", () => {
    it("detects standalone SECRET", () => {
      expectMatch("This document is SECRET", "classification");
    });

    it("does NOT flag 'secretary'", () => {
      expectNoMatch("Served as secretary for the commander", "classification");
    });

    it("does NOT flag 'secretariat'", () => {
      expectNoMatch("Attended Air Staff Secretariat meeting", "classification");
    });

    it("does NOT flag 'secretly'", () => {
      expectNoMatch("He secretly planned the surprise", "classification");
    });

    it("does NOT flag 'secretive'", () => {
      expectNoMatch("The operation was secretive in nature", "classification");
    });

    it("does NOT flag 'open secret'", () => {
      expectNoMatch("It was an open secret that morale improved", "classification");
    });

    it("does NOT flag 'trade secret'", () => {
      expectNoMatch("Protected trade secret information", "classification");
    });

    it("does NOT flag 'no secret'", () => {
      expectNoMatch("It was no secret the team excelled", "classification");
    });

    it("does NOT flag 'keep secret'", () => {
      expectNoMatch("Trained Amn to keep secret data safe", "classification");
    });
  });

  describe("Portion markings (parenthetical)", () => {
    it("detects (S)", () => {
      expectMatch("(S) This paragraph is classified", "classification");
    });

    it("detects (TS)", () => {
      expectMatch("(TS) Information about the program", "classification");
    });

    it("detects (C)", () => {
      expectMatch("(C) Confidential paragraph", "classification");
    });

    it("detects (U)", () => {
      expectMatch("(U) Unclassified portion", "classification");
    });

    it("detects (U//FOUO)", () => {
      expectMatch("(U//FOUO) For official use only", "classification");
    });

    it("detects (S//NF)", () => {
      expectMatch("(S//NF) No foreign access", "classification");
    });

    it("detects (S//NOFORN)", () => {
      expectMatch("(S//NOFORN) Restricted distribution", "classification");
    });

    it("detects (S//REL TO USA, GBR)", () => {
      expectMatch("(S//REL TO USA, GBR) Coalition data", "classification");
    });
  });
});

// ===========================================================================
// CUI MARKINGS
// ===========================================================================

describe("CUI Markings", () => {
  describe("Control marking keywords", () => {
    it("detects CUI (uppercase only)", () => {
      expectMatch("Document marked CUI", "cui_marking");
    });

    it("does NOT detect lowercase 'cui' (Italian word, etc.)", () => {
      expectNoMatch("la cui importanza è grande", "cui_marking");
    });

    it("detects FOUO", () => {
      expectMatch("Marked FOUO by originator", "cui_marking");
    });

    it("detects NOFORN", () => {
      expectMatch("Distribution NOFORN", "cui_marking");
    });

    it("detects ORCON", () => {
      expectMatch("Dissemination control: ORCON", "cui_marking");
    });

    it("detects PROPIN", () => {
      expectMatch("Handling: PROPIN applied", "cui_marking");
    });

    it("detects LIMDIS", () => {
      expectMatch("Release: LIMDIS marking", "cui_marking");
    });

    it("detects SBU", () => {
      expectMatch("Sensitivity: SBU data", "cui_marking");
    });

    it("detects LES", () => {
      expectMatch("Law Enforcement Sensitive LES", "cui_marking");
    });

    it("detects FOR OFFICIAL USE ONLY", () => {
      expectMatch("FOR OFFICIAL USE ONLY - internal memo", "cui_marking");
    });

    it("detects REL TO", () => {
      expectMatch("REL TO USA, AUS, CAN", "cui_marking");
    });
  });

  describe("MGRS Grid Coordinates", () => {
    it("detects standard MGRS coordinate", () => {
      expectMatch("Grid reference 18S UJ 23370 06100", "grid_coord");
    });

    it("detects compact MGRS coordinate", () => {
      expectMatch("Location: 18SUJ23370610", "grid_coord");
    });

    it("detects shorter MGRS with 4 digits", () => {
      expectMatch("At grid 4QFJ12345", "grid_coord");
    });

    it("does NOT flag short alphanumeric codes", () => {
      // Less than 5 digits total should fail validation
      expectNoMatch("Product code 4QFJ12", "grid_coord");
    });
  });

  describe("Latitude/Longitude Coordinates", () => {
    it("detects decimal degree lat/long", () => {
      expectMatch("Position: 38.8977, -77.0365", "lat_long");
    });

    it("detects lat/long with high precision", () => {
      expectMatch("Coordinates 34.0522, -118.2437", "lat_long");
    });

    it("detects DMS format", () => {
      expectMatch("Located at 38°53'23\"N", "lat_long");
    });

    it("detects DMS with prime symbols", () => {
      expectMatch("Position 77°02'12\"W", "lat_long");
    });

    it("does NOT flag short decimal numbers", () => {
      expectNoMatch("Score was 38.89 out of 50", "lat_long");
    });
  });

  describe("IP Addresses", () => {
    it("detects standard IPv4 address", () => {
      expectMatch("Server at 192.168.1.100", "ip_address");
    });

    it("detects another IP", () => {
      expectMatch("Network 10.0.0.1 configured", "ip_address");
    });

    it("does NOT flag 127.0.0.1 (localhost)", () => {
      expectNoMatch("Testing on 127.0.0.1", "ip_address");
    });

    it("does NOT flag 0.0.0.0", () => {
      expectNoMatch("Bound to 0.0.0.0", "ip_address");
    });

    it("does NOT flag 8.8.8.8 (public DNS)", () => {
      expectNoMatch("Using DNS 8.8.8.8", "ip_address");
    });

    it("does NOT flag 255.255.255.255 (broadcast)", () => {
      expectNoMatch("Broadcast 255.255.255.255", "ip_address");
    });

    it("does NOT flag 1.1.1.1 (Cloudflare DNS)", () => {
      expectNoMatch("DNS at 1.1.1.1", "ip_address");
    });
  });

  describe("MAC Addresses", () => {
    it("detects colon-separated MAC", () => {
      expectMatch("Device MAC: AA:BB:CC:DD:EE:FF", "mac_address");
    });

    it("detects dash-separated MAC", () => {
      expectMatch("MAC address 00-1A-2B-3C-4D-5E", "mac_address");
    });

    it("does NOT flag random hex strings", () => {
      expectNoMatch("Color code #AABBCC", "mac_address");
    });
  });

  describe("Military Domain URLs", () => {
    it("detects http .mil URL", () => {
      expectMatch("Visit http://www.af.mil for info", "mil_url");
    });

    it("detects https .mil URL", () => {
      expectMatch("Portal: https://mypay.dfas.mil", "mil_url");
    });

    it("detects subdomain .mil URL", () => {
      expectMatch("Access https://afpc.randolph.af.mil/app", "mil_url");
    });

    it("does NOT flag .mil in email (handled by email pattern)", () => {
      // This should be detected as email, not mil_url
      expectNoMatch("user@mail.mil", "mil_url");
    });
  });
});

// ===========================================================================
// CLEAN TEXT (FALSE POSITIVES AVOIDANCE)
// ===========================================================================

describe("Clean text (no false positives)", () => {
  const cleanStatements = [
    "Led 12 Airmen in rapid deployment exercise, reducing response time by 30%",
    "Managed $2.3M budget for 5 squadrons across 3 installations",
    "Trained 150 personnel on new cyber defense protocols, achieving 98% compliance",
    "Organized base-wide volunteer event with 200+ participants; raised $15K for charity",
    "Spearheaded transition to new logistics system, processing 10K assets in 45 days",
    "Mentored 8 NCOs for promotion; 6 selected, 75% selection rate—doubled wing avg",
    "Awarded Airman of the Quarter, Q3 FY24",
    "Deployed to CENTCOM AOR; coordinated 500+ combat sorties over 180 days",
    "Completed CCAF degree in Cyber Systems Operations with a 3.8 GPA",
    "Served as secretary for the First Sergeants Council",
    "It was no secret the flight excelled in readiness",
    "Executed trade secret protection training for 40 contractors",
    "The unit's mission success was openly shared across the group",
  ];

  for (const stmt of cleanStatements) {
    it(`"${stmt.substring(0, 60)}..." is clean`, () => {
      expectClean(stmt);
    });
  }
});

// ===========================================================================
// MULTIPLE DETECTIONS IN ONE TEXT
// ===========================================================================

describe("Multiple detections", () => {
  it("detects SSN + phone in same text", () => {
    const matches = scan("Contact SSN 123-45-6789 or call (703) 555-0199");
    const types = matches.map((m) => m.type);
    expect(types).toContain("ssn");
    expect(types).toContain("phone");
  });

  it("detects classification + CUI marking together", () => {
    const matches = scan("(S//NF) This FOUO document contains...");
    const types = matches.map((m) => m.type);
    expect(types).toContain("classification");
    expect(types).toContain("cui_marking");
  });

  it("detects email + IP in same text", () => {
    const matches = scan("Admin admin@example.com manages 192.168.0.50");
    const types = matches.map((m) => m.type);
    expect(types).toContain("email");
    expect(types).toContain("ip_address");
  });
});

// ===========================================================================
// MULTI-FIELD SCANNING
// ===========================================================================

describe("Multi-field scanning", () => {
  it("scans details, impact, and metrics independently", () => {
    const matches = scanForSensitiveData({
      details: "Email: john@example.com",
      impact: "Call (555) 123-4567",
      metrics: "Server 192.168.1.50 uptime 99.9%",
    });
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.some((m) => m.field === "details" && m.type === "email")).toBe(true);
    expect(matches.some((m) => m.field === "impact" && m.type === "phone")).toBe(true);
    expect(matches.some((m) => m.field === "metrics" && m.type === "ip_address")).toBe(true);
  });

  it("returns empty for all-clean fields", () => {
    const matches = scanForSensitiveData({
      details: "Led mission planning for 12 sorties",
      impact: "Improved readiness by 25%",
      metrics: "150 trained, 98% pass rate",
    });
    expect(matches).toHaveLength(0);
  });

  it("handles undefined/empty fields", () => {
    const matches = scanForSensitiveData({
      details: "",
      impact: undefined,
    });
    expect(matches).toHaveLength(0);
  });
});

// ===========================================================================
// REDACTION
// ===========================================================================

describe("Redaction", () => {
  it("redacts SSN with typed tag", () => {
    const text = "SSN is 123-45-6789 on file";
    const matches = scan(text);
    const redacted = redactSensitiveData(text, matches);
    expect(redacted).toContain("[REDACTED-SSN]");
    expect(redacted).not.toContain("123-45-6789");
  });

  it("redacts email", () => {
    const text = "Contact john.doe@example.com";
    const matches = scan(text);
    const redacted = redactSensitiveData(text, matches);
    expect(redacted).toContain("[REDACTED-EMAIL]");
    expect(redacted).not.toContain("john.doe@example.com");
  });

  it("redacts matches in stewardship subfields", () => {
    const text = "Saved 40 man-hrs, contact john.doe@example.com for details";
    const matches = scanForSensitiveData({ stewardship_time: text });
    const redacted = redactSensitiveData(text, matches);
    expect(redacted).toContain("[REDACTED-EMAIL]");
    expect(redacted).not.toContain("john.doe@example.com");
  });

  it("redacts multiple matches in order", () => {
    const text = "SSN: 234-56-7890, email: test@test.com";
    const matches = scan(text);
    const redacted = redactSensitiveData(text, matches);
    expect(redacted).toContain("[REDACTED-SSN]");
    expect(redacted).toContain("[REDACTED-EMAIL]");
  });

  it("returns original text when no matches", () => {
    const text = "Led 50 Airmen in readiness exercise";
    const matches = scan(text);
    const redacted = redactSensitiveData(text, matches);
    expect(redacted).toBe(text);
  });
});

describe("redactField helper", () => {
  it("scans and redacts in one call", () => {
    const { redacted, matches } = redactField("My SSN is 345-67-8901", "details");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(redacted).toContain("[REDACTED-SSN]");
  });
});

// ===========================================================================
// SUMMARY OUTPUT
// ===========================================================================

describe("getScanSummary", () => {
  it("returns empty string for no matches", () => {
    expect(getScanSummary([])).toBe("");
  });

  it("includes category labels", () => {
    const matches = scan("SSN: 123-45-6789 and TOP SECRET");
    const summary = getScanSummary(matches);
    expect(summary).toContain("Personally Identifiable Information (PII)");
    expect(summary).toContain("Classification Marking");
  });

  it("includes match labels", () => {
    const matches = scan("Email john@example.com found");
    const summary = getScanSummary(matches);
    expect(summary).toContain("Email Address");
  });

  it("includes warning about unclassified system", () => {
    const matches = scan("SSN: 456-78-9012");
    const summary = getScanSummary(matches);
    expect(summary).toContain("UNCLASSIFIED");
  });
});

// ===========================================================================
// CONVENIENCE WRAPPERS
// ===========================================================================

describe("hasSensitiveData", () => {
  it("returns true for sensitive text", () => {
    expect(hasSensitiveData({ details: "SSN: 123-45-6789" })).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(hasSensitiveData({ details: "Led readiness exercise" })).toBe(false);
  });
});

describe("scanStatementText", () => {
  it("detects sensitive data in a single statement", () => {
    const matches = scanStatementText("Contact john@example.com for details");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].type).toBe("email");
  });

  it("returns empty for clean statement", () => {
    const matches = scanStatementText("Led 12 Airmen across 3 deployments");
    expect(matches).toHaveLength(0);
  });

  it("returns empty for empty/null input", () => {
    expect(scanStatementText("")).toHaveLength(0);
    expect(scanStatementText("   ")).toHaveLength(0);
  });
});

describe("scanAccomplishmentsForLLM", () => {
  it("detects sensitive data across multiple accomplishments", () => {
    const result = scanAccomplishmentsForLLM([
      { details: "Led team of 50 Airmen" },
      { details: "Contact SSN 234-56-7890", impact: "Improved security" },
    ]);
    expect(result.blocked).toBe(true);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });

  it("returns blocked=false for clean accomplishments", () => {
    const result = scanAccomplishmentsForLLM([
      { details: "Led deployment ops", impact: "25% faster", metrics: "150 pax" },
      { details: "Managed $1.5M budget", impact: "Zero deficiencies" },
    ]);
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(0);
  });
});

describe("scanTextForLLM", () => {
  it("detects sensitive data in free text", () => {
    const result = scanTextForLLM("Include email admin@base.mil for reference");
    expect(result.blocked).toBe(true);
  });

  it("handles multiple text args", () => {
    const result = scanTextForLLM(
      "Clean context here",
      "Also clean statement",
      "But SSN 345-67-8901 is here"
    );
    expect(result.blocked).toBe(true);
  });

  it("handles null/undefined args", () => {
    const result = scanTextForLLM(null, undefined, "");
    expect(result.blocked).toBe(false);
  });

  it("returns blocked=false for clean text", () => {
    const result = scanTextForLLM("Standard EPB statement text");
    expect(result.blocked).toBe(false);
  });
});

// ===========================================================================
// EDGE CASES
// ===========================================================================

describe("Edge cases", () => {
  it("handles empty string", () => {
    expectClean("");
  });

  it("handles whitespace-only", () => {
    expectClean("   \n\t  ");
  });

  it("handles very long text without matches", () => {
    const longText = "Led " + "mission operations across multiple AORs ".repeat(200);
    expectClean(longText);
  });

  it("deduplicates overlapping matches", () => {
    // Same SSN mentioned twice at different positions should create 2 matches
    const matches = scan("SSN: 123-45-6789 and again 123-45-6789");
    const ssnMatches = matches.filter((m) => m.type === "ssn");
    expect(ssnMatches).toHaveLength(2);
    // But same position should not duplicate
    expect(ssnMatches[0].index).not.toBe(ssnMatches[1].index);
  });

  it("match objects have correct structure", () => {
    const matches = scan("Email: john@example.com");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const m = matches[0];
    expect(m).toHaveProperty("type");
    expect(m).toHaveProperty("category");
    expect(m).toHaveProperty("value");
    expect(m).toHaveProperty("index");
    expect(m).toHaveProperty("field");
    expect(m).toHaveProperty("severity");
    expect(m).toHaveProperty("label");
    expect(typeof m.index).toBe("number");
    expect(m.field).toBe("details");
  });
});
