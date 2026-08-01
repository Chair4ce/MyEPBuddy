/**
 * Banned EPB formatting guard.
 *
 * The system prompt already forbids slash abbreviations (w/, w/o, b/c),
 * em-dashes, and semicolons — LLMs still hallucinate them. This module:
 * 1. Detects violations (flag)
 * 2. Applies deterministic replacements (preferred — free, reliable)
 * 3. Optionally runs a hard-capped LLM revision (max 2 attempts, never loops)
 * 4. Falls back to deterministic cleanup after LLM attempts fail
 */

import { generateText, type LanguageModel } from "ai";

/** Absolute ceiling — never more than this many LLM revision calls. */
export const MAX_BANNED_FORMATTING_REVISIONS = 2;

export type BannedFormattingRuleId =
  | "w_slash"
  | "wo_slash"
  | "bc_slash"
  | "em_dash"
  | "semicolon";

export interface BannedFormattingRule {
  id: BannedFormattingRuleId;
  /** Human-readable label used in logs / prompts / UI flags */
  label: string;
  /**
   * Detection + replacement pattern.
   * Must use the global flag so replace() hits every occurrence.
   */
  pattern: RegExp;
  replacement: string;
}

/**
 * Patterns the EPB prompt already bans.
 * Order matters: match "w/o" before "w/" so without isn't partially rewritten.
 */
export const BANNED_FORMATTING_RULES: BannedFormattingRule[] = [
  // "w/o" before "w/" — word-ish boundary after o
  {
    id: "wo_slash",
    label: "w/o",
    pattern: /\bw\/o\b/gi,
    replacement: "without",
  },
  // "w/" as abbreviation: followed by space, digit, punctuation, or end
  // (covers "w/ 3", "w/3", "w/,", "w/.")
  {
    id: "w_slash",
    label: "w/",
    pattern: /\bw\/(?=\s|\d|$|[,;.])/gi,
    replacement: "with ",
  },
  {
    id: "bc_slash",
    label: "b/c",
    pattern: /\bb\/c\b/gi,
    replacement: "because",
  },
  {
    id: "em_dash",
    label: "--",
    pattern: /--/g,
    replacement: ", ",
  },
  {
    id: "semicolon",
    label: ";",
    pattern: /;/g,
    replacement: ", ",
  },
];

export interface BannedFormattingViolation {
  id: BannedFormattingRuleId;
  label: string;
  /** First matched snippet (for logging / UI) */
  match: string;
}

export interface DeterministicFixResult {
  text: string;
  /** Labels of rules that fired */
  fixedLabels: string[];
  changed: boolean;
}

export type BannedFormattingRepairMethod =
  | "none"
  | "deterministic"
  | "llm"
  | "deterministic_fallback";

export interface BannedFormattingRepairResult {
  statement: string;
  /** Labels detected on the original input */
  violationsFound: string[];
  /** Labels still present after all repair attempts */
  remainingViolations: string[];
  /** LLM revision attempts used (0–2) */
  attempts: number;
  method: BannedFormattingRepairMethod;
  /** True when input had violations (even if fully repaired) */
  wasFlagged: boolean;
}

function normalizeAfterReplace(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,\s*/g, ", ")
    .replace(/,\s*\./g, ".")
    .replace(/\.,/g, ".")
    .trim();
}

/** Detect banned formatting substrings in a statement. */
export function findBannedFormattingViolations(
  text: string
): BannedFormattingViolation[] {
  const violations: BannedFormattingViolation[] = [];

  for (const rule of BANNED_FORMATTING_RULES) {
    // Reset lastIndex for global patterns
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) {
      violations.push({
        id: rule.id,
        label: rule.label,
        match: match[0],
      });
    }
    rule.pattern.lastIndex = 0;
  }

  return violations;
}

export function hasBannedFormatting(text: string): boolean {
  return findBannedFormattingViolations(text).length > 0;
}

/** Instant, no-LLM replacement of known banned patterns. */
export function applyDeterministicBannedFormattingFixes(
  text: string
): DeterministicFixResult {
  let result = text;
  const fixedLabels: string[] = [];

  for (const rule of BANNED_FORMATTING_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(result)) {
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, rule.replacement);
      fixedLabels.push(rule.label);
    }
    rule.pattern.lastIndex = 0;
  }

  result = normalizeAfterReplace(result);
  return {
    text: result,
    fixedLabels,
    changed: result !== text.trim(),
  };
}

function buildRevisionPrompt(
  statement: string,
  violationLabels: string[]
): string {
  return `The following EPB performance statement contains banned formatting that the writing rules forbid.

VIOLATIONS FOUND: ${violationLabels.join(", ")}

REQUIRED REPLACEMENTS:
- "w/" → "with"
- "w/o" → "without"
- "b/c" → "because"
- "--" → commas
- ";" → commas

RULES:
1. Fix ONLY the banned formatting above
2. Keep every fact, metric, acronym, and name identical
3. Keep approximately the same length
4. Output ONE statement only — no quotes, no explanation, no markdown

STATEMENT:
${statement}`;
}

/**
 * Flag + repair banned formatting with a hard-capped revision budget.
 *
 * Flow:
 * 1. Detect → flag
 * 2. Deterministic replace (preferred)
 * 3. If still dirty and a model is provided: up to `maxAttempts` LLM revisions (≤ 2)
 * 4. Final deterministic fallback
 * 5. Stop — never loops beyond the cap
 */
export async function repairBannedFormatting(
  statement: string,
  options: {
    model?: LanguageModel;
    /** LLM revision attempts; hard-capped at MAX_BANNED_FORMATTING_REVISIONS */
    maxAttempts?: number;
  } = {}
): Promise<BannedFormattingRepairResult> {
  const original = statement.trim();
  const initialViolations = findBannedFormattingViolations(original);
  const violationsFound = initialViolations.map((v) => v.label);

  if (initialViolations.length === 0) {
    return {
      statement: original,
      violationsFound: [],
      remainingViolations: [],
      attempts: 0,
      method: "none",
      wasFlagged: false,
    };
  }

  console.warn(
    `[BannedFormatting] Flagged statement with: ${violationsFound.join(", ")}`
  );

  // Prefer deterministic repair — no tokens, no loop risk
  const deterministic = applyDeterministicBannedFormattingFixes(original);
  let current = deterministic.text;
  let remaining = findBannedFormattingViolations(current);

  if (remaining.length === 0) {
    return {
      statement: current,
      violationsFound,
      remainingViolations: [],
      attempts: 0,
      method: "deterministic",
      wasFlagged: true,
    };
  }

  const maxAttempts = Math.min(
    Math.max(0, options.maxAttempts ?? MAX_BANNED_FORMATTING_REVISIONS),
    MAX_BANNED_FORMATTING_REVISIONS
  );

  let attempts = 0;
  let usedLlm = false;

  // Hard-capped LLM revision — only if deterministic left residue and model given
  if (options.model && maxAttempts > 0) {
    while (remaining.length > 0 && attempts < maxAttempts) {
      attempts++;
      try {
        const { text } = await generateText({
          model: options.model,
          system:
            "You are a precise EPB statement editor. Fix banned formatting only. Output the corrected statement and nothing else.",
          prompt: buildRevisionPrompt(
            current,
            remaining.map((v) => v.label)
          ),
          temperature: 0.2,
          maxOutputTokens: 500,
        });

        const revised = text.trim().replace(/^["']|["']$/g, "");
        if (!revised || revised === current) {
          console.warn(
            `[BannedFormatting] LLM attempt ${attempts} returned no usable change, stopping`
          );
          break;
        }

        // Always run deterministic after LLM so residual w/ cannot survive
        const afterLlm = applyDeterministicBannedFormattingFixes(revised);
        current = afterLlm.text;
        usedLlm = true;
        remaining = findBannedFormattingViolations(current);

        if (remaining.length === 0) {
          break;
        }
      } catch (error) {
        console.error(
          `[BannedFormatting] LLM attempt ${attempts} failed:`,
          error
        );
        break;
      }
    }
  }

  // Final deterministic fallback after LLM budget exhausted
  if (remaining.length > 0) {
    const fallback = applyDeterministicBannedFormattingFixes(current);
    current = fallback.text;
    remaining = findBannedFormattingViolations(current);
  }

  const method: BannedFormattingRepairMethod = usedLlm
    ? remaining.length > 0
      ? "deterministic_fallback"
      : "llm"
    : remaining.length > 0
      ? "deterministic_fallback"
      : "deterministic";

  if (remaining.length > 0) {
    console.warn(
      `[BannedFormatting] Remaining after ${attempts} LLM attempt(s): ${remaining
        .map((v) => v.label)
        .join(", ")}`
    );
  }

  return {
    statement: current,
    violationsFound,
    remainingViolations: remaining.map((v) => v.label),
    attempts,
    method,
    wasFlagged: true,
  };
}

/**
 * Repair an array of statements. Sequential to keep LLM attempt budget predictable.
 */
export async function repairBannedFormattingBatch(
  statements: string[],
  options: {
    model?: LanguageModel;
    maxAttempts?: number;
  } = {}
): Promise<{
  statements: string[];
  flaggedCount: number;
  results: BannedFormattingRepairResult[];
}> {
  const results: BannedFormattingRepairResult[] = [];
  const repaired: string[] = [];
  let flaggedCount = 0;

  for (const stmt of statements) {
    const result = await repairBannedFormatting(stmt, options);
    results.push(result);
    repaired.push(result.statement);
    if (result.wasFlagged) flaggedCount++;
  }

  return { statements: repaired, flaggedCount, results };
}
