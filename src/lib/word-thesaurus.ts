/** Shared helpers for highlight-to-replace (context suggestions + full synonyms). */

export const WORD_THESAURUS_SUGGESTED_COUNT = 6;
export const WORD_THESAURUS_MAX_WORD_LENGTH = 40;

const SINGLE_WORD_RE = /^[A-Za-z][A-Za-z'-]{0,39}$/;

/** Function words that should not auto-spend an LLM call. */
const SKIP_LLM_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "for",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
]);

export type PhraseReviseMode = "expand" | "compress" | "general";

export type WordThesaurusDocumentContext = "epb" | "award" | "decoration";

export function trimSelection(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isSingleSelectableWord(text: string): boolean {
  const trimmed = trimSelection(text);
  return trimmed.length > 0 && SINGLE_WORD_RE.test(trimmed) && !trimmed.includes(" ");
}

export function shouldAutoFetchSuggestions(word: string): boolean {
  const trimmed = trimSelection(word);
  if (!isSingleSelectableWord(trimmed)) return false;
  if (trimmed.length < 3) return false;
  return !SKIP_LLM_WORDS.has(trimmed.toLowerCase());
}

/**
 * Sentence that contains [start, end) in the original string.
 * Uses the live editor text (not whitespace-normalized) so indices stay valid.
 */
export function sentenceContainingRange(
  text: string,
  start: number,
  end: number,
): string {
  if (!text) return "";
  const clampedStart = Math.max(0, Math.min(start, text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, text.length));

  let from = clampedStart;
  while (from > 0) {
    const prev = text[from - 1];
    if (prev === "." || prev === "!" || prev === "?") break;
    from -= 1;
  }
  while (from < clampedStart && /\s/.test(text[from] ?? "")) from += 1;

  let to = clampedEnd;
  while (to < text.length) {
    const ch = text[to];
    to += 1;
    if (ch === "." || ch === "!" || ch === "?") break;
  }

  const sentence = text.slice(from, to).trim();
  return sentence || text.trim();
}

export function preserveReplacementCase(
  original: string,
  replacement: string,
): string {
  const trimmedOriginal = original.trim();
  const trimmedReplacement = replacement.trim();
  if (!trimmedOriginal || !trimmedReplacement) return trimmedReplacement;

  if (trimmedOriginal === trimmedOriginal.toUpperCase() && /[A-Z]/.test(trimmedOriginal)) {
    return trimmedReplacement.toUpperCase();
  }

  const originalFirst = trimmedOriginal[0];
  if (
    originalFirst &&
    originalFirst === originalFirst.toUpperCase() &&
    originalFirst !== originalFirst.toLowerCase()
  ) {
    return trimmedReplacement.charAt(0).toUpperCase() + trimmedReplacement.slice(1);
  }

  const isAcronym =
    trimmedReplacement === trimmedReplacement.toUpperCase() &&
    /[A-Z]/.test(trimmedReplacement) &&
    trimmedReplacement.length <= 6;
  if (isAcronym) return trimmedReplacement;

  return trimmedReplacement.charAt(0).toLowerCase() + trimmedReplacement.slice(1);
}

export function applyRangeReplacement(
  text: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const clampedStart = Math.max(0, Math.min(start, text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, text.length));
  return text.slice(0, clampedStart) + replacement + text.slice(clampedEnd);
}

export function fieldOffsetInContext(fieldText: string, contextText: string): number | null {
  if (!contextText) return null;
  if (fieldText && contextText.includes(fieldText)) {
    return contextText.indexOf(fieldText);
  }
  const needle = fieldText.trim();
  if (needle && contextText.includes(needle)) {
    return contextText.indexOf(needle);
  }
  return null;
}

export interface ThesaurusDocumentContextPayload {
  fullStatement: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Map a highlight inside one editor field onto the full statement the LLM
 * should see (e.g. both EPB split-view sentences). Replacement still uses
 * the field-local range.
 */
export function resolveThesaurusDocumentContext(opts: {
  fieldText: string;
  fieldStart: number;
  fieldEnd: number;
  contextText?: string;
}): ThesaurusDocumentContextPayload {
  const fieldLen = opts.fieldText.length;
  const fieldStart = Math.max(0, Math.min(opts.fieldStart, fieldLen));
  const fieldEnd = Math.max(fieldStart, Math.min(opts.fieldEnd, fieldLen));
  const context = opts.contextText ?? "";
  if (!context || context === opts.fieldText) {
    return {
      fullStatement: opts.fieldText,
      selectionStart: fieldStart,
      selectionEnd: fieldEnd,
    };
  }
  const offset = fieldOffsetInContext(opts.fieldText, context);
  if (offset == null) {
    return {
      fullStatement: opts.fieldText,
      selectionStart: fieldStart,
      selectionEnd: fieldEnd,
    };
  }
  return {
    fullStatement: context,
    selectionStart: offset + fieldStart,
    selectionEnd: offset + fieldEnd,
  };
}

export function sanitizeThesaurusWord(word: string): string {
  return trimSelection(word).slice(0, WORD_THESAURUS_MAX_WORD_LENGTH);
}

export function splitSuggestedAndRest(items: string[], suggestedCount = WORD_THESAURUS_SUGGESTED_COUNT): {
  suggested: string[];
  rest: string[];
} {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return {
    suggested: unique.slice(0, suggestedCount),
    rest: unique.slice(suggestedCount),
  };
}
