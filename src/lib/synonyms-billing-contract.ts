/**
 * Product billing contract for highlight-word replacement suggestions:
 * POST /api/synonyms is a free LLM assist. Expand / compress / rephrase
 * still consume one prepaid credit each via POST /api/revise-selection.
 */

/** Synonym suggestions must never call consume_credit. */
export const SYNONYMS_CONSUME_CREDIT = false as const;

/** Phrase expand / compress / rephrase still consume one credit per successful click. */
export const REVISE_SELECTION_USAGE_CHECKS_PER_REQUEST = 1 as const;
