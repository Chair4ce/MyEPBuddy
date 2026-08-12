import { ENTRY_MGAS } from "@/lib/constants";

export const MAX_EXTRACTED_ACCOMPLISHMENTS = 40;

const VALID_MPA_KEYS = new Set(ENTRY_MGAS.map((m) => m.key));

export interface RawExtractedAccomplishment {
  action_verb?: unknown;
  details?: unknown;
  impact?: unknown;
  metrics?: unknown;
  mpa?: unknown;
  confidence?: unknown;
}

export interface NormalizedExtractedAccomplishment {
  action_verb: string;
  details: string;
  impact: string;
  metrics: string;
  mpa: string;
  confidence: number;
}

/** Review-row shape used by the bulk dialog (client-side). */
export interface BulkAccomplishmentDraft {
  id: string;
  action_verb: string;
  details: string;
  impact: string;
  metrics: string;
  mpa: string;
  confidence: number;
  date: string;
  cycle_year: number;
  included: boolean;
  selectedForCombine: boolean;
}

function asTrimmedString(value: unknown, maxLen = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function asConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normalizeMpa(value: unknown): string {
  const key = asTrimmedString(value, 64);
  if (VALID_MPA_KEYS.has(key)) return key;
  return "miscellaneous";
}

/**
 * Sanitize one LLM-extracted accomplishment. Drops rows without usable details.
 */
export function normalizeExtractedAccomplishment(
  raw: RawExtractedAccomplishment,
): NormalizedExtractedAccomplishment | null {
  const details = asTrimmedString(raw.details, 2000);
  if (details.length < 8) return null;

  let actionVerb = asTrimmedString(raw.action_verb, 64);
  if (!actionVerb) {
    const first = details.split(/\s+/)[0] ?? "";
    actionVerb = first.replace(/[^A-Za-z]/g, "") || "Led";
  }

  return {
    action_verb: actionVerb,
    details: ensureDetailsStandAlone(
      actionVerb,
      cleanupAccomplishmentProse(details),
    ),
    impact: cleanupAccomplishmentProse(asTrimmedString(raw.impact, 1000)),
    metrics: cleanupAccomplishmentProse(asTrimmedString(raw.metrics, 500)),
    mpa: normalizeMpa(raw.mpa),
    confidence: asConfidence(raw.confidence),
  };
}

export function normalizeExtractedAccomplishments(
  rawList: unknown,
  cap = MAX_EXTRACTED_ACCOMPLISHMENTS,
): NormalizedExtractedAccomplishment[] {
  if (!Array.isArray(rawList)) return [];

  const out: NormalizedExtractedAccomplishment[] = [];
  for (const item of rawList) {
    if (out.length >= cap) break;
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeExtractedAccomplishment(
      item as RawExtractedAccomplishment,
    );
    if (normalized) out.push(normalized);
  }
  return out;
}

export function toBulkDrafts(
  items: NormalizedExtractedAccomplishment[],
  defaults: { date: string; cycleYear: number },
): BulkAccomplishmentDraft[] {
  const now = Date.now();
  return items.map((item, index) => ({
    id: `bulk-${now}-${index}`,
    action_verb: item.action_verb,
    details: item.details,
    impact: item.impact,
    metrics: item.metrics,
    mpa: item.mpa,
    confidence: item.confidence,
    date: defaults.date,
    cycle_year: defaults.cycleYear,
    included: true,
    selectedForCombine: false,
  }));
}

function joinNonEmpty(parts: string[], sep: string): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(sep);
}

/**
 * Merge 2+ drafts into one (cumulative metrics / stacked narrative).
 * Sources are expected to be the selected-for-combine rows.
 */
export function combineBulkAccomplishmentDrafts(
  sources: BulkAccomplishmentDraft[],
): BulkAccomplishmentDraft | null {
  if (sources.length < 2) return null;

  const strongest = sources.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  );

  return {
    id: `bulk-combined-${Date.now()}`,
    action_verb: strongest.action_verb || sources[0]!.action_verb,
    details: joinNonEmpty(
      sources.map((s) => s.details),
      "; ",
    ),
    impact: joinNonEmpty(
      sources.map((s) => s.impact),
      "; ",
    ),
    metrics: joinNonEmpty(
      sources.map((s) => s.metrics),
      "; ",
    ),
    mpa: strongest.mpa || sources[0]!.mpa,
    confidence: Math.max(...sources.map((s) => s.confidence)),
    date: sources.map((s) => s.date).sort()[0] || sources[0]!.date,
    cycle_year: strongest.cycle_year,
    included: true,
    selectedForCombine: false,
  };
}

/**
 * Replace selected-for-combine rows with a single merged draft.
 * Non-selected rows keep their order; merged row is inserted at the first
 * selected index.
 */
export function applyCombineToDrafts(
  drafts: BulkAccomplishmentDraft[],
): BulkAccomplishmentDraft[] {
  const selected = drafts.filter((d) => d.selectedForCombine && d.included);
  const merged = combineBulkAccomplishmentDrafts(selected);
  if (!merged) return drafts;

  const selectedIds = new Set(selected.map((d) => d.id));
  const firstIndex = drafts.findIndex((d) => selectedIds.has(d.id));
  const remaining = drafts.filter((d) => !selectedIds.has(d.id));
  const insertAt = firstIndex < 0 ? remaining.length : Math.min(firstIndex, remaining.length);
  return [
    ...remaining.slice(0, insertAt),
    merged,
    ...remaining.slice(insertAt),
  ];
}

/** Light deterministic prose tidy (whitespace, capitalization, trailing punctuation). */
export function cleanupAccomplishmentProse(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return "";
  out = out.replace(/^[,;:\-–—]\s*/, "");
  out = out.charAt(0).toUpperCase() + out.slice(1);
  out = out.replace(/\s+(and|or|with|for|to|of|the|a|an)$/i, "");
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Entry cards render `details` alone (not verb + details). Ensure details is a
 * complete standalone sentence that begins with the action verb.
 */
export function ensureDetailsStandAlone(
  actionVerb: string,
  details: string,
): string {
  const verb = cleanupAccomplishmentProse(actionVerb).replace(/[.]+$/, "");
  let d = cleanupAccomplishmentProse(details);
  if (!d) return d;
  if (!verb) return d;

  if (new RegExp(`^${escapeRegExp(verb)}\\b`, "i").test(d)) {
    // Normalize leading verb casing to the stored action_verb.
    return `${verb}${d.slice(verb.length)}`;
  }

  // "Led Led teams..." guard if details already starts with same verb ignore-case
  // handled above. Prepend verb to fragment tails like "teams of…", "as Wing…".
  const rest = d.charAt(0).toLowerCase() + d.slice(1);
  return cleanupAccomplishmentProse(`${verb} ${rest}`);
}

/**
 * Apply grammar-polish LLM output onto the extract results.
 * Preserves action_verb / mpa / confidence; only refreshes prose fields when
 * the polish row provides non-empty text.
 */
export function mergeGrammarPolishedAccomplishments(
  originals: NormalizedExtractedAccomplishment[],
  polishedList: unknown,
): NormalizedExtractedAccomplishment[] {
  const applyProse = (item: NormalizedExtractedAccomplishment) => ({
    ...item,
    details: ensureDetailsStandAlone(item.action_verb, item.details),
    impact: cleanupAccomplishmentProse(item.impact),
    metrics: cleanupAccomplishmentProse(item.metrics),
  });

  if (!Array.isArray(polishedList) || polishedList.length === 0) {
    return originals.map(applyProse);
  }

  return originals.map((orig, index) => {
    const raw = polishedList[index];
    if (!raw || typeof raw !== "object") {
      return applyProse(orig);
    }

    const polished = raw as RawExtractedAccomplishment;
    const details =
      asTrimmedString(polished.details, 2000) || orig.details;
    const impactRaw = asTrimmedString(polished.impact, 1000);
    const impact = impactRaw || orig.impact;
    const metricsRaw = asTrimmedString(polished.metrics, 500);
    const metrics = metricsRaw || orig.metrics;

    return applyProse({
      ...orig,
      details: details.length >= 8 ? details : orig.details,
      impact,
      metrics,
    });
  });
}

export function parseExtractJsonPayload(llmResponse: string): unknown {
  let jsonStr = llmResponse.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  return JSON.parse(jsonStr.trim());
}
