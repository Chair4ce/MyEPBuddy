/**
 * Text cleaning utilities for bulk statement import
 * Handles unicode characters, special formatting, and EPB-specific patterns
 */

// Unicode character replacements
const UNICODE_REPLACEMENTS: [RegExp, string][] = [
  // Smart quotes to standard quotes
  [/[\u2018\u2019\u201A\u201B]/g, "'"], // Single quotes
  [/[\u201C\u201D\u201E\u201F]/g, '"'], // Double quotes
  // Dashes
  [/[\u2013\u2014\u2015]/g, "-"], // En-dash, em-dash, horizontal bar
  [/\u2212/g, "-"], // Minus sign
  // Spaces
  [/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " "], // Various space characters
  // Bullets and symbols
  [/[\u2022\u2023\u2043\u204C\u204D]/g, "-"], // Bullet points
  [/\u0bd7/g, "/"], // Tamil character often used as separator
  // Ellipsis
  [/\u2026/g, "..."],
  // Other common issues
  [/\u00AD/g, ""], // Soft hyphen
  [/[\uFEFF\u200C\u200D]/g, ""], // Zero-width characters
];

// EPB system-generated text patterns to remove
const SYSTEM_PATTERNS: RegExp[] = [
  /System Generated EPB.*?INFORMATION\./gi,
  /SYSTEM GENERATED PAGE \d+ \/ \d+/gi,
  /\(\d{10}\)/g, // EDIPI numbers like (1297063533)
  /\\\\signed,.*?\\\\$/gm, // Signature blocks
  /PRIVACY ACT INFORMATION:.*?INFORMATION\./gi,
  /CONTROLLED UNCLASSIFIED INFORMATION/gi,
];

// MPA header patterns for detection
export const MPA_HEADER_PATTERNS: { pattern: RegExp; mpaKey: string }[] = [
  // Full headers with descriptions
  { 
    pattern: /EXECUTING THE MISSION[:\s]*(?:EFFECTIVELY USES KNOWLEDGE.*?MISSION)?/gi, 
    mpaKey: "executing_mission" 
  },
  { 
    pattern: /LEADING PEOPLE[:\s]*(?:FOSTERS COHESIVE TEAMS.*?MISSION)?/gi, 
    mpaKey: "leading_people" 
  },
  { 
    pattern: /MANAGING RESOURCES[:\s]*(?:MANAGES ASSIGNED RESOURCES.*?PERFORMANCE)?/gi, 
    mpaKey: "managing_resources" 
  },
  { 
    pattern: /IMPROVING THE UNIT[:\s]*(?:DEMONSTRATES CRITICAL THINKING.*?EXECUTION)?/gi, 
    mpaKey: "improving_unit" 
  },
  // Abbreviated patterns
  { pattern: /\bEM:/gi, mpaKey: "executing_mission" },
  { pattern: /\bLP:/gi, mpaKey: "leading_people" },
  { pattern: /\bMR:/gi, mpaKey: "managing_resources" },
  { pattern: /\bIU:/gi, mpaKey: "improving_unit" },
  // RATER ASSESSMENT prefix
  { pattern: /RATER ASSESSMENT\s+EXECUTING/gi, mpaKey: "executing_mission" },
];

/**
 * Clean raw text by replacing unicode characters and normalizing whitespace
 */
export function cleanText(text: string): string {
  let cleaned = text;
  
  // Apply unicode replacements
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  
  // Remove system-generated patterns
  for (const pattern of SYSTEM_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  // Normalize whitespace
  cleaned = cleaned
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, " ") // Tabs to spaces
    .replace(/ +/g, " ") // Multiple spaces to single
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines to double
    .trim();
  
  return cleaned;
}

/**
 * Extract date range from EPB text (e.g., "1 Oct 24 THRU 30 Sep 25")
 */
export function extractDateRange(text: string): { start: string; end: string } | null {
  // Pattern: "DD Mon YY THRU DD Mon YY" or "DD Mmm YYYY THRU DD Mmm YYYY"
  const dateRangePattern = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})\s+(?:THRU|TO|THROUGH|-)\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})/i;
  
  const match = text.match(dateRangePattern);
  if (match) {
    return {
      start: match[1],
      end: match[2],
    };
  }
  
  // Try PERIOD format
  const periodPattern = /PERIOD\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})\s+(?:THRU|TO|THROUGH|-)\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})/i;
  const periodMatch = text.match(periodPattern);
  if (periodMatch) {
    return {
      start: periodMatch[1],
      end: periodMatch[2],
    };
  }
  
  return null;
}

/**
 * Extract cycle year from date range or text
 */
export function extractCycleYear(text: string): number | null {
  const dateRange = extractDateRange(text);
  if (dateRange) {
    // Try to parse the end date year
    const yearMatch = dateRange.end.match(/\d{4}$/);
    if (yearMatch) {
      return parseInt(yearMatch[0]);
    }
    // Try 2-digit year
    const shortYearMatch = dateRange.end.match(/\d{2}$/);
    if (shortYearMatch) {
      const year = parseInt(shortYearMatch[0]);
      return year > 50 ? 1900 + year : 2000 + year;
    }
  }
  
  // Look for explicit year mentions
  const yearPattern = /(?:FY|CY|Cycle|Year)\s*['"]?(\d{4}|\d{2})/i;
  const yearMatch = text.match(yearPattern);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year > 1000) return year;
    return year > 50 ? 1900 + year : 2000 + year;
  }
  
  return null;
}

/**
 * Detect MPA from text context
 */
export function detectMpaFromContext(text: string): string | null {
  const upperText = text.toUpperCase();
  
  for (const { pattern, mpaKey } of MPA_HEADER_PATTERNS) {
    if (pattern.test(upperText)) {
      return mpaKey;
    }
  }
  
  return null;
}

/**
 * Split compound statements (typically 2 sentences) into individual statements
 * EPB statements often have action-result format with 2 sentences
 */
export function splitStatements(text: string): string[] {
  // First, split by obvious statement boundaries
  const statements: string[] = [];
  
  const trimmedText = text.trim();
  
  // Simple approach: split on ". " followed by uppercase, but keep 2-sentence groups
  const sentences = trimmedText.split(/(?<=\.)\s+(?=[A-Z])/);
  
  // Group sentences into statement pairs (action + result)
  for (let i = 0; i < sentences.length; i += 2) {
    if (i + 1 < sentences.length) {
      // Combine two sentences into one statement
      const combined = `${sentences[i].trim()} ${sentences[i + 1].trim()}`;
      if (combined.length > 50) { // Minimum length check
        statements.push(combined);
      }
    } else if (sentences[i].length > 50) {
      // Last sentence if odd number
      statements.push(sentences[i].trim());
    }
  }
  
  // If no statements were extracted, return the original as one statement
  if (statements.length === 0 && trimmedText.length > 50) {
    return [trimmedText];
  }
  
  return statements;
}

/**
 * Check if text looks like a valid statement (has action verb and result)
 */
export function isValidStatement(text: string): boolean {
  if (!text || text.length < 50) return false;
  if (text.length > 500) return false;
  
  // Should start with a capital letter
  if (!/^[A-Z]/.test(text)) return false;
  
  // Should contain at least one verb-like word
  const hasVerb = /\b(?:led|managed|directed|coordinated|executed|developed|trained|created|built|designed|implemented|established|organized|supervised|achieved|completed|delivered|supported|assisted|maintained|improved|enhanced|streamlined|resolved|analyzed|identified|secured|protected|enabled|facilitated|pioneered|transformed|accelerated|championed|drove|guided|mentored|oversaw|spearheaded|orchestrated)\b/i.test(text);
  
  // Should have some numbers/metrics (common in EPB statements)
  const hasMetrics = /\d+/.test(text);
  
  return hasVerb || hasMetrics;
}

/**
 * Clean a single statement text
 */
export function cleanStatement(text: string): string {
  let cleaned = cleanText(text);
  
  // Remove leading dashes or bullets
  cleaned = cleaned.replace(/^[-•*]\s*/, "");
  
  // Ensure proper capitalization
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  // Ensure ends with period
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }
  
  return cleaned.trim();
}
