/**
 * Character-budget instructions for POST /api/revise-selection.
 *
 * Generate already enforces a hard package max. Revise used to say
 * "stay within ±20% of the original" — so a 450-char over-limit draft
 * produced 450–540 char "improvements" that still cannot be saved.
 */

import { parseStatement } from "@/lib/sentence-utils";

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

/** EPB packages are at most two sentences; match the split-view parser. */
export function expectedRevisionSentenceCount(text: string): 1 | 2 {
  return parseStatement(text).hasTwoSentences ? 2 : 1;
}

export function buildSentenceCountGuidance(count: 1 | 2): string {
  if (count === 2) {
    return `**SENTENCE COUNT (NON-NEGOTIABLE):** The original is TWO sentences that SHARE one character budget.
Each revision MUST be exactly TWO sentences: "Sentence one. Sentence two."
- Do NOT merge them into one comma-spliced sentence to save space
- Do NOT drop the second sentence
- Each sentence is its own standalone sentence with its own opening verb
- Use a period + space BETWEEN the two sentences; commas only INSIDE a sentence
- Do NOT put the second accomplishment in parentheses`
  }
  return `**SENTENCE COUNT:** The original is ONE sentence. Keep exactly one sentence — do not split it into two.`;
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
The revised selection MUST be ≤ ${selMax} characters (aim ${targetMin}–${targetMax}). The original is ${selectedLength} characters — ${charsOver} OVER. myEval REJECTS anything over ${selMax}.${spliceNote}

**SYNONYM-ONLY REWRITES FAIL.** Swapping "Drove"→"Executed" or "Managed"→"Commanded" while keeping the same clauses DOES NOT COUNT. You MUST REMOVE at least ${charsOver} characters of wording.

How to get under ${selMax} (keep every metric, $, unit name, and acronym):
- Delete the weakest impact/result clause in EACH sentence (the trailing "bolstering/vital/key to …" phrase is often the right cut)
- Prefer "&" over "and"; drop "the" / "a" / "an" where grammar still holds
- Abbreviate: hrs, mos, wks, mbrs, sq, flt, gp, wg, ops, pers, 1st
- Merge redundant clauses WITHIN a sentence — do NOT merge the two sentences into one
- Count characters BEFORE returning. If any revision is still over ${selMax}, cut another clause.

Target: ${targetMin}–${targetMax} characters. MAXIMUM ${selMax}. Do not land near 200.`
      : `**HARD CHARACTER LIMIT:** Revised selection MUST be ${targetMin}–${targetMax} characters (full field max ${hardMax}).${spliceNote}
Stay within 5% of the field max. NEVER exceed ${selMax}. Landing ~200 characters when the max is ${selMax} is a FAILURE.`;

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
