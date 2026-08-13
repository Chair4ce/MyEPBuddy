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
import { parseStatement } from "@/lib/sentence-utils";

/** Absolute max LLM compress attempts for a package (hard cap). */
export const MAX_PACKAGE_COMPRESS_ATTEMPTS = 3;

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
 * Uses the same parser as the EPB split-view UI so revise/enforce
 * agree with what the user sees as sentence 1 vs sentence 2.
 */
export function splitJoinedStatements(text: string): string[] {
  const parsed = parseStatement(text);
  return parsed.sentences.map((s) => s.text).filter(Boolean);
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

function statementsAreComplete(statements: string[]): boolean {
  return (
    statements.length > 0 &&
    statements.every((s) => {
      const t = s.trim();
      return t.length >= 8 && /[.!?]$/.test(t);
    })
  );
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
5. Each array item MUST be a COMPLETE sentence ending with a period — never truncate, never drop a trailing clause mid-thought
6. Keep one sentence per array item — no semicolons, no em-dashes (-- or —), no "<" or ">"
7. Do NOT invent new facts. Do NOT merge two statements into one. Do NOT drop a statement
8. Count characters carefully before answering

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
    | "per_statement";
  stillOver: boolean;
}

async function llmCompressPackage(opts: {
  current: string[];
  combined: number;
  targetMax: number;
  model: LanguageModel;
}): Promise<string[] | null> {
  const charsOver = opts.combined - opts.targetMax;
  const { text } = await generateText({
    model: opts.model,
    system:
      "You are a precise EPB editor. Compress statements to fit a hard combined character budget. Every statement must stay a complete sentence. Never truncate. Output JSON only.",
    prompt: buildPackageCompressPrompt(
      opts.current,
      opts.combined,
      opts.targetMax,
      charsOver
    ),
    temperature: 0.2,
    maxOutputTokens: opts.current.length >= 2 ? 1400 : 800,
  });

  const parsed = parseStatementArray(text.trim(), opts.current.length);
  if (!parsed || !statementsAreComplete(parsed)) return null;

  const next = parsed.map(applyDeterministicCompress);
  if (!statementsAreComplete(next)) return null;
  if (combinedStatementLength(next) >= opts.combined) return null;
  return next;
}

/**
 * Best-effort enforce combined ≤ targetMax for a statement package.
 * Compresses with abbreviations and LLM rewrite only — never truncates
 * a sentence to fit. If still over after retries, stillOver is true and
 * the returned statements stay complete.
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
      const next = applyDeterministicCompress(result.statement);
      if (statementsAreComplete([next])) {
        current = next;
        attempts = result.attempts;
        method = result.wasAdjusted ? "per_statement" : method;
      }
    }

    if (current.length > targetMax && options.model) {
      try {
        attempts++;
        const compressed = await llmCompressPackage({
          current: [current],
          combined: current.length,
          targetMax,
          model: options.model,
        });
        if (compressed) {
          current = compressed[0];
          method = "llm";
        }
      } catch (error) {
        console.error("[PackageChar] single-statement compress failed:", error);
      }
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
      try {
        const next = await llmCompressPackage({
          current,
          combined,
          targetMax,
          model: options.model,
        });
        if (!next) {
          console.warn(
            `[PackageChar] LLM attempt ${attempts} rejected (incomplete, unparseable, or not shorter)`
          );
          continue;
        }

        current = next;
        combined = combinedStatementLength(current);
        wasAdjusted = true;
        method = "llm";
      } catch (error) {
        console.error(`[PackageChar] LLM attempt ${attempts} failed:`, error);
        break;
      }
    }
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

export interface RevisionEnforceResult {
  text: string;
  stillOver: boolean;
  method: PackageEnforceResult["method"];
}

/**
 * Enforce a hard max on one revised blob (one or two joined sentences).
 * Splits, compresses as a shared package, then re-joins for the UI.
 * Never truncates a sentence to fit the cap.
 */
export async function enforceRevisionText(
  text: string,
  targetMax: number,
  options: {
    model?: LanguageModel;
    maxAttempts?: number;
    context?: string;
  } = {}
): Promise<RevisionEnforceResult> {
  const parts = splitJoinedStatements(text);
  const result = await enforcePackageCharacterLimit(parts, targetMax, options);
  return {
    text: combineStatementsForDisplay(result.statements),
    stillOver: result.stillOver,
    method: result.method,
  };
}

/**
 * If revise collapsed a two-sentence package into one sentence, ask the model
 * to restore two sentences without inventing facts. One batched LLM call.
 */
export async function repairCollapsedTwoSentenceRevisions(
  original: string,
  revisions: string[],
  targetMax: number,
  options: { model: LanguageModel }
): Promise<string[]> {
  const flags = revisions.map((r) => !parseStatement(r).hasTwoSentences);
  if (!flags.some(Boolean)) return revisions;

  const numbered = revisions
    .map((r, i) => (flags[i] ? `[${i + 1}] ${r.trim()}` : null))
    .filter((line): line is string => line !== null)
    .join("\n\n");

  try {
    const { text } = await generateText({
      model: options.model,
      system:
        "You restore EPB two-sentence packages that were wrongly merged into one sentence. Output JSON only.",
      prompt: `ORIGINAL TWO-SENTENCE PACKAGE:
"${original.trim()}"

These revisions collapsed to ONE sentence. Rewrite EACH as EXACTLY TWO complete sentences (Sentence. Sentence.) that share a ${targetMax}-character combined budget. Keep every metric, $, unit name, and acronym. Do not invent facts. Do not merge back into one sentence. Do not truncate a sentence to fit.

COLLAPSED REVISIONS:
${numbered}

Return a JSON array of strings — one restored two-sentence package per collapsed revision, in the same order:
["restored 1", "restored 2"]`,
      temperature: 0.2,
      maxOutputTokens: 1200,
    });

    const parsed = parseStatementArray(text.trim(), flags.filter(Boolean).length);
    if (!parsed) {
      console.warn("[PackageChar] two-sentence restore returned unparseable output");
      return revisions;
    }

    const next = [...revisions];
    let p = 0;
    for (let i = 0; i < next.length; i++) {
      if (!flags[i]) continue;
      const restored = parsed[p++]?.trim();
      if (restored && parseStatement(restored).hasTwoSentences) {
        next[i] = restored;
      }
    }
    return next;
  } catch (error) {
    console.error("[PackageChar] two-sentence restore failed:", error);
    return revisions;
  }
}

/** Re-export validation helper for callers that only need a check. */
export { validateCharacterCount };
