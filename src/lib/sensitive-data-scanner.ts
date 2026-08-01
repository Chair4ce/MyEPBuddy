/**
 * Sensitive Data Scanner
 *
 * Isomorphic utility (client + server) that detects PII, CUI, and
 * classification markings in free-text fields.  Used for:
 *  - Pre-save hard-block (client)
 *  - Server-side validation (defense-in-depth)
 *  - Post-save auto-redaction (background scan)
 *
 * Pattern categories:
 *  PII        – SSN, phone, email, DoD ID, DOB context, addresses
 *  Classification – SECRET / TS / CONFIDENTIAL / portion markings
 *  CUI        – CUI/FOUO/NOFORN markings, MGRS coords, IP addrs, .mil URLs
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SensitiveMatchType =
  | "ssn"
  | "phone"
  | "email"
  | "dod_id"
  | "dob"
  | "address"
  | "classification"
  | "cui_marking"
  | "grid_coord"
  | "lat_long"
  | "ip_address"
  | "mac_address"
  | "mil_url";

export type SensitiveCategory = "pii" | "classification" | "cui";
export type Severity = "high" | "critical";

export interface SensitiveMatch {
  /** Which pattern matched */
  type: SensitiveMatchType;
  /** Broad category */
  category: SensitiveCategory;
  /** The matched text */
  value: string;
  /** Character index in the scanned string */
  index: number;
  /** Which form field the match came from */
  field: string;
  /** PII = high, classification = critical */
  severity: Severity;
  /** Human-readable label for UI messages */
  label: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternDef {
  type: SensitiveMatchType;
  category: SensitiveCategory;
  severity: Severity;
  label: string;
  regex: RegExp;
  /** Optional post-match validator to reduce false positives */
  validate?: (match: string, fullText: string, index: number) => boolean;
}

/**
 * SSN area numbers that are never valid:
 *  - 000, 666, 900-999
 */
function isPlausibleSSN(digits: string): boolean {
  const cleaned = digits.replace(/-/g, "");
  if (cleaned.length !== 9) return false;
  const area = parseInt(cleaned.substring(0, 3), 10);
  const group = parseInt(cleaned.substring(3, 5), 10);
  const serial = parseInt(cleaned.substring(5, 9), 10);
  if (area === 0 || area === 666 || area >= 900) return false;
  if (group === 0 || serial === 0) return false;
  return true;
}

const PATTERNS: PatternDef[] = [
  // ── PII ──────────────────────────────────────────────────────────────────

  // SSN with dashes (XXX-XX-XXXX)
  {
    type: "ssn",
    category: "pii",
    severity: "critical",
    label: "Social Security Number",
    regex: /\b(\d{3}-\d{2}-\d{4})\b/g,
    validate: (match) => isPlausibleSSN(match),
  },

  // SSN without dashes – 9 consecutive digits with word boundaries
  // Needs extra context to avoid matching generic 9-digit numbers
  {
    type: "ssn",
    category: "pii",
    severity: "critical",
    label: "Social Security Number",
    regex: /\b(\d{9})\b/g,
    validate: (match, fullText, index) => {
      if (!isPlausibleSSN(match)) return false;
      // Look for nearby SSN-related context words to reduce false positives
      const window = fullText
        .substring(Math.max(0, index - 40), index + match.length + 40)
        .toLowerCase();
      const contextWords = ["ssn", "social security", "ss#", "ssan", "social sec"];
      return contextWords.some((w) => window.includes(w));
    },
  },

  // Phone numbers – multiple common US formats
  {
    type: "phone",
    category: "pii",
    severity: "high",
    label: "Phone Number",
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    validate: (match) => {
      // Must contain at least one separator or parens to distinguish from other numbers
      return /[\(\)\-.\s]/.test(match);
    },
  },

  // Email addresses
  {
    type: "email",
    category: "pii",
    severity: "high",
    label: "Email Address",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },

  // DoD ID / EDIPI (10-digit number with context)
  {
    type: "dod_id",
    category: "pii",
    severity: "critical",
    label: "DoD ID / EDIPI",
    regex: /\b(\d{10})\b/g,
    validate: (_match, fullText, index) => {
      const window = fullText
        .substring(Math.max(0, index - 50), index + 20)
        .toLowerCase();
      const contextWords = ["dod id", "edipi", "cac", "id card", "dodid", "dod #"];
      return contextWords.some((w) => window.includes(w));
    },
  },

  // Date of Birth context
  {
    type: "dob",
    category: "pii",
    severity: "high",
    label: "Date of Birth",
    regex:
      /\b(?:dob|date\s+of\s+birth|born\s+on|birthday|birth\s+date)\s*[:;]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  },

  // Street addresses – number + street name + suffix
  {
    type: "address",
    category: "pii",
    severity: "high",
    label: "Street Address",
    regex:
      /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+\s+){1,3}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir(?:cle)?|Pkwy|Parkway|Hwy|Highway)\b\.?/gi,
  },

  // ── Classification Markings ──────────────────────────────────────────────

  // Full classification levels as standalone words / markings
  {
    type: "classification",
    category: "classification",
    severity: "critical",
    label: "Classification Marking",
    regex:
      /\b(?:TOP\s+SECRET|TS\/SCI|TS\/\/SCI|CONFIDENTIAL|UNCLASSIFIED\/\/FOUO)\b/gi,
  },

  // "SECRET" needs careful handling to avoid "secretary", "secretariat", etc.
  {
    type: "classification",
    category: "classification",
    severity: "critical",
    label: "Classification Marking",
    regex: /\bSECRET\b/g,
    validate: (_match, fullText, index) => {
      // Check that it is NOT followed by "ar" (secretary/secretariat/secretarial)
      const after = fullText.substring(index + 6, index + 12).toLowerCase();
      if (after.startsWith("ar") || after.startsWith("ly") || after.startsWith("iv")) {
        return false;
      }
      // Check it is not preceded by "open ", "no ", "trade "
      const before = fullText.substring(Math.max(0, index - 8), index).toLowerCase().trim();
      const innocentPrefixes = ["open", "no", "trade", "the", "a", "an", "it's no", "keep"];
      return !innocentPrefixes.some((p) => before.endsWith(p));
    },
  },

  // Portion markings in parentheses: (S), (TS), (C), (U), (U//FOUO), (S//NF)
  {
    type: "classification",
    category: "classification",
    severity: "critical",
    label: "Portion Marking",
    regex: /\((?:TS|S|C|U)(?:\/\/(?:FOUO|NF|NOFORN|REL\s+TO\s+[A-Z, ]+))?\)/g,
  },

  // ── CUI Markings ─────────────────────────────────────────────────────────

  // CUI control markings
  {
    type: "cui_marking",
    category: "cui",
    severity: "critical",
    label: "CUI Marking",
    regex:
      /\b(?:CUI|FOUO|NOFORN|REL\s+TO|ORCON|PROPIN|LIMDIS|SBU|LES|FOR\s+OFFICIAL\s+USE\s+ONLY)\b/gi,
    validate: (match) => {
      // "CUI" must be uppercase to avoid matching common words
      if (match.toLowerCase() === "cui") {
        return match === "CUI";
      }
      return true;
    },
  },

  // ── Operational / CUI Data ───────────────────────────────────────────────

  // MGRS grid coordinates (e.g., 18S UJ 2337 0610)
  {
    type: "grid_coord",
    category: "cui",
    severity: "critical",
    label: "MGRS Grid Coordinate",
    regex: /\b\d{1,2}[A-Z]{1,3}\s?[A-Z]{2}\s?\d{4,10}\b/g,
    validate: (match) => {
      // Must have at least 4 digits at the end for grid precision
      const digits = match.replace(/[^0-9]/g, "");
      return digits.length >= 5;
    },
  },

  // Lat/Long – decimal degrees
  {
    type: "lat_long",
    category: "cui",
    severity: "high",
    label: "Latitude/Longitude Coordinate",
    regex:
      /\b-?(?:[1-8]?\d(?:\.\d{4,})|90(?:\.0+)?)\s*[,\s]\s*-?(?:1[0-7]\d|\d{1,2})(?:\.\d{4,})\b/g,
  },

  // Lat/Long – DMS format  (e.g., 38°53'23"N 77°02'12"W)
  {
    type: "lat_long",
    category: "cui",
    severity: "high",
    label: "Latitude/Longitude Coordinate",
    regex:
      /\b\d{1,3}[°]\s*\d{1,2}[′']\s*\d{1,2}(?:\.\d+)?[″"]?\s*[NSEW]\b/gi,
  },

  // IP addresses (IPv4)
  {
    type: "ip_address",
    category: "cui",
    severity: "high",
    label: "IP Address",
    regex:
      /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    validate: (match) => {
      // Exclude common non-sensitive IPs
      const nonSensitive = ["0.0.0.0", "127.0.0.1", "255.255.255.255", "1.1.1.1", "8.8.8.8", "8.8.4.4"];
      return !nonSensitive.includes(match);
    },
  },

  // MAC addresses
  {
    type: "mac_address",
    category: "cui",
    severity: "high",
    label: "MAC Address",
    regex: /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
  },

  // .mil domain URLs
  {
    type: "mil_url",
    category: "cui",
    severity: "high",
    label: "Military Domain URL",
    regex: /\bhttps?:\/\/[^\s]+\.mil\b/gi,
  },
];

// ---------------------------------------------------------------------------
// Core scan function
// ---------------------------------------------------------------------------

/**
 * Scan one or more text fields for sensitive data patterns.
 *
 * @returns Array of matches (empty = clean).
 */
export function scanForSensitiveData(
  fields: Record<string, string | null | undefined>
): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];

  for (const [fieldName, text] of Object.entries(fields)) {
    if (!text || text.trim().length === 0) continue;
    scanText(text, fieldName, matches);
  }

  // De-duplicate overlapping matches (same position & type)
  return deduplicateMatches(matches);
}

function scanText(text: string, field: string, out: SensitiveMatch[]): void {
  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const value = match[0];
      const index = match.index;

      // Run optional validator
      if (pattern.validate && !pattern.validate(value, text, index)) {
        continue;
      }

      out.push({
        type: pattern.type,
        category: pattern.category,
        value,
        index,
        field,
        severity: pattern.severity,
        label: pattern.label,
      });
    }
  }
}

function deduplicateMatches(matches: SensitiveMatch[]): SensitiveMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.field}:${m.type}:${m.index}:${m.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Field names `redactSensitiveData` will rewrite (legacy + stewardship keys). */
export const REDACTABLE_FIELDS = new Set([
  "details",
  "impact",
  "metrics",
  "stewardship_time",
  "stewardship_money",
  "stewardship_resources",
  "stewardship_outcome",
]);

/**
 * Replace sensitive matches with typed redaction tags.
 * Example: "SSN 123-45-6789" → "SSN [REDACTED-SSN]"
 */
export function redactSensitiveData(
  text: string,
  matches: SensitiveMatch[]
): string {
  if (!matches.length) return text;

  // Sort matches by index descending so replacements don't shift positions
  const sorted = [...matches]
    .filter((m) => REDACTABLE_FIELDS.has(m.field))
    .sort((a, b) => b.index - a.index);

  let result = text;
  for (const m of sorted) {
    const tag = `[REDACTED-${m.type.toUpperCase()}]`;
    result = result.substring(0, m.index) + tag + result.substring(m.index + m.value.length);
  }
  return result;
}

/**
 * Convenience wrapper that scans a single field and redacts in one step.
 */
export function redactField(
  text: string,
  fieldName: string
): { redacted: string; matches: SensitiveMatch[] } {
  const matches = scanForSensitiveData({ [fieldName]: text });
  // Adjust matches to use the provided fieldName for redaction
  const fieldMatches = matches.filter((m) => m.field === fieldName);
  return {
    redacted: redactSensitiveData(text, fieldMatches),
    matches: fieldMatches,
  };
}

// ---------------------------------------------------------------------------
// Human-readable summary
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  pii: "Personally Identifiable Information (PII)",
  classification: "Classification Marking",
  cui: "Controlled Unclassified Information (CUI)",
};

/**
 * Produce a human-readable summary for toast / error messages.
 */
export function getScanSummary(matches: SensitiveMatch[]): string {
  if (matches.length === 0) return "";

  // Group by category
  const byCategory = matches.reduce(
    (acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    },
    {} as Record<SensitiveCategory, SensitiveMatch[]>
  );

  const parts: string[] = [];

  // Build category summaries, critical first
  const order: SensitiveCategory[] = ["classification", "cui", "pii"];
  for (const cat of order) {
    const items = byCategory[cat];
    if (!items?.length) continue;

    // Unique labels
    const uniqueLabels = [...new Set(items.map((i) => i.label))];
    parts.push(`${CATEGORY_LABELS[cat]}: ${uniqueLabels.join(", ")}`);
  }

  return (
    "Entry blocked — sensitive data detected. " +
    "Remove the following before saving:\n\n" +
    parts.join("\n") +
    "\n\nThis system is UNCLASSIFIED. Do not enter classified, CUI, or PII."
  );
}

/**
 * Quick boolean check – useful for conditional UI.
 */
export function hasSensitiveData(fields: {
  details?: string;
  impact?: string;
  metrics?: string;
}): boolean {
  return scanForSensitiveData(fields).length > 0;
}

// ---------------------------------------------------------------------------
// LLM pre-transmission guard
// ---------------------------------------------------------------------------

/**
 * Scan an array of accomplishment-like objects before sending to an LLM
 * provider.  Accepts flexible shapes so it works across all generation
 * and assessment routes.
 *
 * @returns `{ blocked: true, matches }` if any sensitive data is found.
 */
export function scanAccomplishmentsForLLM(
  items: Array<{
    details?: string | null;
    impact?: string | null;
    metrics?: string | null;
    stewardship_time?: string | null;
    stewardship_money?: string | null;
    stewardship_resources?: string | null;
    stewardship_outcome?: string | null;
  }>
): { blocked: boolean; matches: SensitiveMatch[] } {
  const allMatches: SensitiveMatch[] = [];

  for (const item of items) {
    const matches = scanForSensitiveData({
      details: item.details,
      impact: item.impact,
      metrics: item.metrics,
      stewardship_time: item.stewardship_time,
      stewardship_money: item.stewardship_money,
      stewardship_resources: item.stewardship_resources,
      stewardship_outcome: item.stewardship_outcome,
    });
    allMatches.push(...matches);
  }

  return {
    blocked: allMatches.length > 0,
    matches: allMatches,
  };
}

/**
 * Scan a single statement text before saving to the database.
 * Returns matches array — empty means clean.
 */
export function scanStatementText(text: string): SensitiveMatch[] {
  if (!text || text.trim().length === 0) return [];
  return scanForSensitiveData({ details: text });
}

/**
 * Scan free-text context strings (customContext, existingStatement, etc.)
 * that are sent directly to LLM providers.
 */
export function scanTextForLLM(
  ...texts: (string | null | undefined)[]
): { blocked: boolean; matches: SensitiveMatch[] } {
  const allMatches: SensitiveMatch[] = [];

  for (const text of texts) {
    if (!text || text.trim().length === 0) continue;
    // Scan as "details" field — the field name is cosmetic for the match object
    const matches = scanForSensitiveData({ details: text });
    allMatches.push(...matches);
  }

  return {
    blocked: allMatches.length > 0,
    matches: allMatches,
  };
}
