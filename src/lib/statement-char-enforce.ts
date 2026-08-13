/**
 * Combined / package character-limit enforcement for EPB statements.
 *
 * Two-sentence packages share ONE max (e.g. 350). The UI joins with
 * ". " or " " — we mirror that when measuring. Soft LLM prompts alone
 * overshoot badly (~420–440); this module best-effort compresses before
 * versions are returned to the client.
 */

import { generateText, type LanguageModel } from "ai";
import { applyDeterministicBannedFormattingFixes } from "@/lib/banned-formatting";
import {
  enforceCharacterLimits,
  validateCharacterCount,
} from "@/lib/character-verification";

/** Absolute max LLM compress attempts for a package (hard cap). */
export const MAX_PACKAGE_COMPRESS_ATTEMPTS = 2;

/** How the UI combines multi-statement packages (epb-shell-form / mpa cards). */
export function combineStatementsForDisplay(statements: string[]): string {
  const cleaned = statements.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  const separator = cleaned[0].endsWith(".") ? " " : ". ";
  return cleaned.join(separator);
}

export function combinedStatementLength(statements: string[]): number {
  return combineStatementsForDisplay(statements).length;
}

/**
 * Split a joined two-sentence EPB package back into statements.
 * Requires a lowercase letter, digit, or ")" immediately before the period
 * so abbreviations like "U.S. Air Force" are not split.
 */
export function splitJoinedStatements(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/(?<=[a-z0-9)]\.)\s+(?=[A-Z][a-z])/);
  const cleaned = parts.map((s) => s.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : [trimmed];
}

/**
 * Deterministic length savers that preserve meaning.
 * Safe to run repeatedly; never invents content.
 */
export function applyDeterministicCompress(text: string): string {
  let result = text.trim();

  // Banned formatting first (also strips < > — etc.)
  result = applyDeterministicBannedFormattingFixes(result).text;

  const replacements: [RegExp, string][] = [
    [/\band\b/gi, "&"],
    [/\bin order to\b/gi, "to"],
    [/\bas well as\b/gi, "&"],
    [/\ba total of\b/gi, ""],
    [/\bin excess of\b/gi, "over"],
    [/\bless than\b/gi, "under"],
    [/\bgreater than\b/gi, "over"],
    [/\bapproximately\b/gi, "~"],
    [/\bhours?\b/gi, "hrs"],
    [/\bmonths?\b/gi, "mos"],
    [/\bweeks?\b/gi, "wks"],
    [/\bmembers?\b/gi, "mbrs"],
    [/\bsquadron\b/gi, "sq"],
    [/\bflight\b/gi, "flt"],
    [/\bgroup\b/gi, "gp"],
    [/\bwing\b/gi, "wg"],
    [/\boperations?\b/gi, "ops"],
    [/\bpersonnel\b/gi, "pers"],
    [/\bhighly\s+/gi, ""],
    [/\bvery\s+/gi, ""],
    [/\boverall\s+/gi, ""],
    [/\bsuccessfully\s+/gi, ""],
    [/\beffectively\s+/gi, ""],
    [/\bthis enabled\b/gi, "enabling"],
    [/\bthis facilitated\b/gi, "facilitating"],
    [/\bthis supported\b/gi, "supporting"],
    [/\bproviding support to\b/gi, "supporting"],
    [/\ballowing\b/gi, "enabling"],
    [/\bformulated\b/gi, "built"],
    [/\bdeveloped\b/gi, "built"],
    [/\btransitioning\b/gi, "moving"],
    [/\bbroadening\b/gi, "extending"],
    [/\benhancing\b/gi, "boosting"],
    [/\bstrengthening\b/gi, "boosting"],
    [/\bimproving\b/gi, "boosting"],
    [/\bproving vital for\b/gi, "vital for"],
    [/\bcritical for\b/gi, "vital for"],
    [/\bessential for\b/gi, "vital for"],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  result = result
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+([,.])/g, "$1")
    .trim();

  return result;
}

/**
 * Last-resort trim: drop trailing clauses at comma boundaries until ≤ max.
 * Prefer cutting from the end so the lead action stays intact.
 */
export function trimToMaxAtClauseBoundary(
  text: string,
  maxChars: number
): string {
  let result = text.trim();
  if (result.length <= maxChars) return result;

  while (result.length > maxChars) {
    const cut = result.lastIndexOf(",");
    if (cut < Math.floor(maxChars * 0.45)) {
      // No safe clause boundary — hard cut at word boundary
      const slice = result.slice(0, maxChars);
      const lastSpace = slice.lastIndexOf(" ");
      result =
        lastSpace > Math.floor(maxChars * 0.6)
          ? slice.slice(0, lastSpace).trim()
          : slice.trim();
      break;
    }
    result = result.slice(0, cut).trim();
  }

  // Ensure we don't end mid-punctuation awkwardly
  result = result.replace(/[,&\s]+$/, "").trim();
  if (result && !/[.!?]$/.test(result)) {
    // Keep as clause; UI may join with period
  }
  return result;
}

function buildPackageCompressPrompt(
  statements: string[],
  combinedLength: number,
  targetMax: number,
  charsOver: number
): string {
  const numbered = statements
    .map((s, i) => `[${i + 1}] (${s.length} chars) ${s}`)
    .join("\n");

  return `You are compressing EPB performance statements that SHARE a single character budget.

CURRENT PACKAGE (combined when joined): ${combinedLength} characters
HARD MAX (combined): ${targetMax} characters
MUST REMOVE AT LEAST: ${charsOver} characters from the package

STATEMENTS (will be joined with ". " or " " on the frontend):
${numbered}

RULES:
1. Return EXACTLY ${statements.length} statements as a JSON array of strings
2. Combined length of all statements (plus ~1–2 chars for the join) MUST be ≤ ${targetMax}
3. Prefer denser abbreviations: hrs, mos, wks, sq, flt, mbrs, ops, &
4. Keep EVERY metric, dollar amount, unit name, and acronym
5. Keep one sentence per array item — no semicolons, no em-dashes (-- or —), no "<" or ">"
6. Do NOT invent new facts
7. Count characters carefully before answering

OUTPUT (JSON only):
["compressed statement 1", "compressed statement 2"]`;
}

function parseStatementArray(
  text: string,
  expectedCount: number
): string[] | null {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const stmts = parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    if (stmts.length !== expectedCount) return null;
    return stmts;
  } catch {
    return null;
  }
}

export interface PackageEnforceResult {
  statements: string[];
  combinedLength: number;
  targetMax: number;
  wasAdjusted: boolean;
  attempts: number;
  method:
    | "none"
    | "deterministic"
    | "llm"
    | "trim_fallback"
    | "per_statement";
  stillOver: boolean;
}

/**
 * Best-effort enforce combined ≤ targetMax for a statement package.
 * Single-statement packages use enforceCharacterLimits when a model is provided.
 */
export async function enforcePackageCharacterLimit(
  statements: string[],
  targetMax: number,
  options: {
    model?: LanguageModel;
    maxAttempts?: number;
    context?: string;
  } = {}
): Promise<PackageEnforceResult> {
  const cleaned = statements.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return {
      statements: [],
      combinedLength: 0,
      targetMax,
      wasAdjusted: false,
      attempts: 0,
      method: "none",
      stillOver: false,
    };
  }

  // Single statement — reuse existing enforcer when model available
  if (cleaned.length === 1) {
    const original = cleaned[0];
    let current = applyDeterministicCompress(original);
    let method: PackageEnforceResult["method"] =
      current !== original ? "deterministic" : "none";
    let attempts = 0;

    if (current.length > targetMax && options.model) {
      const result = await enforceCharacterLimits(current, {
        targetMax,
        targetMin: Math.max(0, targetMax - 30),
        maxRetries: options.maxAttempts ?? MAX_PACKAGE_COMPRESS_ATTEMPTS,
        model: options.model,
        context: options.context,
      });
      current = applyDeterministicCompress(result.statement);
      attempts = result.attempts;
      method = result.wasAdjusted ? "per_statement" : method;
    }

    if (current.length > targetMax) {
      current = trimToMaxAtClauseBoundary(current, targetMax);
      method = "trim_fallback";
    }

    return {
      statements: [current],
      combinedLength: current.length,
      targetMax,
      wasAdjusted: current !== original,
      attempts,
      method,
      stillOver: current.length > targetMax,
    };
  }

  // Multi-statement package — shared budget
  let current = cleaned.map(applyDeterministicCompress);
  let combined = combinedStatementLength(current);
  let wasAdjusted =
    current.join("\0") !== cleaned.join("\0");
  let method: PackageEnforceResult["method"] = wasAdjusted
    ? "deterministic"
    : "none";
  let attempts = 0;

  if (combined <= targetMax) {
    return {
      statements: current,
      combinedLength: combined,
      targetMax,
      wasAdjusted,
      attempts: 0,
      method,
      stillOver: false,
    };
  }

  const maxAttempts = Math.min(
    options.maxAttempts ?? MAX_PACKAGE_COMPRESS_ATTEMPTS,
    MAX_PACKAGE_COMPRESS_ATTEMPTS
  );

  if (options.model && maxAttempts > 0) {
    while (combined > targetMax && attempts < maxAttempts) {
      attempts++;
      const charsOver = combined - targetMax;
      try {
        const { text } = await generateText({
          model: options.model,
          system:
            "You are a precise EPB editor. Compress statements to fit a hard combined character budget. Output JSON only.",
          prompt: buildPackageCompressPrompt(
            current,
            combined,
            targetMax,
            charsOver
          ),
          temperature: 0.2,
          maxOutputTokens: 800,
        });

        const parsed = parseStatementArray(text.trim(), current.length);
        if (!parsed) {
          console.warn(
            `[PackageChar] LLM attempt ${attempts} returned unparseable output`
          );
          break;
        }

        const next = parsed.map(applyDeterministicCompress);
        const nextCombined = combinedStatementLength(next);

        // Accept only if we improved (shorter) — never grow
        if (nextCombined >= combined) {
          console.warn(
            `[PackageChar] LLM attempt ${attempts} did not shrink (${nextCombined} ≥ ${combined}), stopping`
          );
          break;
        }

        current = next;
        combined = nextCombined;
        wasAdjusted = true;
        method = "llm";

        if (combined <= targetMax) break;
      } catch (error) {
        console.error(`[PackageChar] LLM attempt ${attempts} failed:`, error);
        break;
      }
    }
  }

  // Last resort: trim longest statement(s) at clause boundaries
  if (combined > targetMax) {
    const overhead = current.length > 1 ? (current[0].endsWith(".") ? 1 : 2) : 0;
    // Budget each statement proportionally to current lengths
    const bodyBudget = Math.max(40, targetMax - overhead);
    const totalBody = current.reduce((sum, s) => sum + s.length, 0) || 1;

    current = current.map((s) => {
      const share = Math.max(
        40,
        Math.floor((s.length / totalBody) * bodyBudget)
      );
      return s.length > share ? trimToMaxAtClauseBoundary(s, share) : s;
    });
    combined = combinedStatementLength(current);
    wasAdjusted = true;
    method = "trim_fallback";
  }

  return {
    statements: current,
    combinedLength: combined,
    targetMax,
    wasAdjusted,
    attempts,
    method,
    stillOver: combined > targetMax,
  };
}

/**
 * Enforce a hard max on one revised blob (one or two joined sentences).
 * Splits, compresses as a shared package, then re-joins for the UI.
 */
export async function enforceRevisionText(
  text: string,
  targetMax: number,
  options: {
    model?: LanguageModel;
    maxAttempts?: number;
    context?: string;
  } = {}
): Promise<string> {
  const parts = splitJoinedStatements(text);
  const result = await enforcePackageCharacterLimit(parts, targetMax, options);
  return combineStatementsForDisplay(result.statements);
}

/** Re-export validation helper for callers that only need a check. */
export { validateCharacterCount };
