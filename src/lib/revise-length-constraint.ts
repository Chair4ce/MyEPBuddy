/**
 * Character-budget instructions for POST /api/revise-selection.
 *
 * Generate already enforces a hard package max. Revise used to say
 * "stay within ±20% of the original" — so a 450-char over-limit draft
 * produced 450–540 char "improvements" that still cannot be saved.
 */

export type ReviseMode = "expand" | "compress" | "general";

export interface ReviseLengthGuidance {
  hardMax: number | null;
  /** Max length of the revised selection after splicing into surrounding text. */
  selectionMax: number | null;
  mustCompressToFit: boolean;
  targetMin: number;
  targetMax: number;
  promptBlock: string;
}

const MIN_SANITY = 80;
const MAX_SANITY = 5000;
const MIN_SELECTION_BUDGET = 20;

/** Stay within 5% of the field max (e.g. 332–350 for a 350 cap). */
export const WITHIN_LIMIT_RATIO = 0.95;

export function withinLimitTargetMin(maxChars: number): number {
  const max = Math.max(0, Math.floor(maxChars));
  return Math.min(max, Math.floor(max * WITHIN_LIMIT_RATIO));
}

/** Accept a client-supplied max; reject nonsense so we don't trust raw JSON. */
export function sanitizeMaxCharacters(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return undefined;
  const floored = Math.floor(n);
  if (floored < MIN_SANITY || floored > MAX_SANITY) return undefined;
  return floored;
}

/** Remaining chars the selection may use so before+selection+after ≤ hardMax. */
export function selectionBudget(
  hardMax: number,
  surroundingLength: number
): number {
  return Math.max(MIN_SELECTION_BUDGET, hardMax - Math.max(0, surroundingLength));
}

export function buildReviseLengthGuidance(opts: {
  selectedLength: number;
  maxCharacters?: number;
  mode: ReviseMode;
  surroundingLength?: number;
}): ReviseLengthGuidance {
  const selectedLength = Math.max(0, Math.floor(opts.selectedLength));
  const hardMax = opts.maxCharacters ?? null;
  const surroundingLength = Math.max(0, Math.floor(opts.surroundingLength ?? 0));

  if (hardMax != null) {
    const selMax = selectionBudget(hardMax, surroundingLength);
    const over = selectedLength > selMax;
    const charsOver = selectedLength - selMax;
    const targetMax = selMax;
    const fillMin = withinLimitTargetMin(selMax);
    let targetMin: number;

    if (opts.mode === "compress" && !over) {
      targetMin = Math.max(0, Math.round(Math.min(selectedLength, selMax) * 0.65));
    } else if (opts.mode === "expand" && !over) {
      targetMin = Math.min(selMax, Math.max(selectedLength, fillMin));
    } else {
      // General revise, or any mode that must compress to fit: fill to within 5% of the cap.
      targetMin = fillMin;
    }

    if (targetMin > targetMax) {
      targetMin = fillMin;
    }

    const spliceNote =
      surroundingLength > 0
        ? ` Surrounding (unselected) text is ${surroundingLength} characters. The selection itself MUST be ≤ ${selMax} so the full field stays ≤ ${hardMax}.`
        : "";

    const promptBlock = over
      ? `**HARD CHARACTER LIMIT (NON-NEGOTIABLE):**
The revised selection MUST be ≤ ${selMax} characters. The original selection is ${selectedLength} characters (${charsOver} OVER). Over-limit text cannot be used in myEval.${spliceNote}

Do NOT stay near the original length. You must REMOVE at least ${charsOver} characters.
How to compress (keep every metric, $, unit name, and acronym):
- Prefer "&" over "and"; drop "the" where grammar still holds
- Abbreviate: hrs, mos, wks, mbrs, sq, flt, gp, wg, ops, pers
- Cut filler: "this action", "this initiative", "this directly", "resulting in", "providing support for"
- Merge clauses; drop the weakest impact phrase if still over
- Count characters BEFORE returning. If any version is over ${selMax}, rewrite it shorter.

Target: ${targetMin}–${targetMax} characters (within 5% of the ${selMax} max). MAXIMUM ${selMax}. Do not land 15–20% under the cap.`
      : `**HARD CHARACTER LIMIT:** Revised selection MUST be ≤ ${selMax} characters (full field max ${hardMax}).${spliceNote}
Target ${targetMin}–${targetMax} characters (within 5% of the field max). NEVER exceed ${selMax}. Do not land 15–20% under the cap.`;

    return {
      hardMax,
      selectionMax: selMax,
      mustCompressToFit: over,
      targetMin,
      targetMax,
      promptBlock,
    };
  }

  const expandMin = Math.round(selectedLength * 1.2);
  const expandMax = Math.round(selectedLength * 1.4);
  const compressMin = Math.round(selectedLength * 0.65);
  const compressMax = Math.round(selectedLength * 0.85);
  const generalMin = Math.round(selectedLength * 0.8);
  const generalMax = Math.round(selectedLength * 1.2);

  const targetMin =
    opts.mode === "expand"
      ? expandMin
      : opts.mode === "compress"
        ? compressMin
        : generalMin;
  const targetMax =
    opts.mode === "expand"
      ? expandMax
      : opts.mode === "compress"
        ? compressMax
        : generalMax;

  return {
    hardMax: null,
    selectionMax: null,
    mustCompressToFit: false,
    targetMin,
    targetMax,
    promptBlock: `**LENGTH:** Stay within ±20% of the original ${selectedLength} characters (target ${targetMin}–${targetMax}). A shorter truthful revision beats a longer fabricated one.`,
  };
}
