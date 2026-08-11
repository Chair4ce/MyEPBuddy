import { composeImpactString } from "@/lib/stewardship-impact";
import {
  ACA_PORTFOLIO_MPA_KEYS,
  type AcaPortfolioMpaKey,
} from "@/lib/cycle-portfolio";
import type {
  Accomplishment,
  AccomplishmentMPARelevancy,
} from "@/types/database";

/**
 * Data contract for the "Generate EPB" planning step.
 *
 * Score-based assignment (`assignEpbSentenceGroups`) inspects every cycle
 * accomplishment (with its ACA relevancy scores) and returns, per core MPA, up
 * to two "sentence groups". Each group is the set of accomplishments to combine
 * into ONE statement sentence. Related action verbs are combined so metrics can
 * accumulate; leftovers are stashed for cross-MPA fill.
 */

/** Max accomplishments per LLM planning chunk (keeps payloads well under limits). */
export const PLAN_CHUNK_MAX_ENTRIES = 35;
/** Trim long free-text so a chunk payload stays bounded. */
export const PLAN_FIELD_MAX_CHARS = 400;
/** EPB MPAs are two sentences max. */
export const PLAN_MAX_SENTENCES_PER_MPA = 2;

export interface PlanSentenceGroup {
  /** Accomplishment ids to combine into ONE sentence. */
  accomplishmentIds: string[];
  /** One-line, ratee-neutral rationale. */
  rationale: string;
}

export interface PlanMpaSelection {
  mpaKey: AcaPortfolioMpaKey;
  sentences: PlanSentenceGroup[];
}

export interface EpbPlan {
  mpas: PlanMpaSelection[];
}

/** Compact accomplishment record sent to the planning model. */
export interface PlanAccomplishmentRecord {
  id: string;
  taggedMpa: string;
  action_verb: string;
  details: string;
  impact: string | null;
  metrics: string | null;
  overallScore: number | null;
  primaryMpa: string | null;
  mpaRelevancy: AccomplishmentMPARelevancy | null;
}

function truncate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= PLAN_FIELD_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, PLAN_FIELD_MAX_CHARS)}…`;
}

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

/** Shape one accomplishment into the compact planning record. */
export function toPlanRecord(a: Accomplishment): PlanAccomplishmentRecord {
  const scores = a.assessment_scores;
  return {
    id: a.id,
    taggedMpa: a.mpa,
    action_verb: a.action_verb,
    details: truncate(a.details) ?? "",
    impact: truncate(composeImpactString(a.stewardship_impact) || a.impact),
    metrics: truncate(a.metrics),
    overallScore: scores?.overall_score ?? null,
    primaryMpa: scores?.primary_mpa ?? null,
    mpaRelevancy: scores?.mpa_relevancy ?? null,
  };
}

/** Keep only ACA-taggable accomplishments and map to planning records. */
export function toPlanRecords(
  entries: Accomplishment[]
): PlanAccomplishmentRecord[] {
  return entries.filter((e) => isAcaMpaKey(e.mpa)).map(toPlanRecord);
}

/** Split records into chunks the model can handle in a single call. */
export function chunkForPlanning<T>(
  records: T[],
  maxPerChunk: number = PLAN_CHUNK_MAX_ENTRIES
): T[][] {
  const size = Math.max(1, Math.floor(maxPerChunk));
  const chunks: T[][] = [];
  for (let i = 0; i < records.length; i += size) {
    chunks.push(records.slice(i, i + size));
  }
  return chunks;
}

/** Merge per-chunk plans into one candidate plan (concat sentences per MPA). */
export function mergeChunkPlans(plans: EpbPlan[]): EpbPlan {
  const byMpa = new Map<AcaPortfolioMpaKey, PlanSentenceGroup[]>();
  for (const plan of plans) {
    for (const selection of plan.mpas) {
      if (!isAcaMpaKey(selection.mpaKey)) continue;
      const existing = byMpa.get(selection.mpaKey) ?? [];
      existing.push(...selection.sentences);
      byMpa.set(selection.mpaKey, existing);
    }
  }
  return {
    mpas: ACA_PORTFOLIO_MPA_KEYS.filter((key) => byMpa.has(key)).map((key) => ({
      mpaKey: key,
      sentences: byMpa.get(key)!,
    })),
  };
}

/**
 * Validate/normalize a raw model plan against the known accomplishment ids:
 * drop unknown ids, drop empty groups, cap sentences per MPA, dedupe ids within
 * a group, and keep only the four core MPA keys.
 */
export function sanitizePlan(raw: unknown, validIds: Set<string>): EpbPlan {
  const mpas: PlanMpaSelection[] = [];
  const rawMpas =
    raw && typeof raw === "object" && Array.isArray((raw as { mpas?: unknown }).mpas)
      ? ((raw as { mpas: unknown[] }).mpas)
      : [];

  for (const rawSelection of rawMpas) {
    if (!rawSelection || typeof rawSelection !== "object") continue;
    const mpaKey = (rawSelection as { mpaKey?: unknown }).mpaKey;
    if (typeof mpaKey !== "string" || !isAcaMpaKey(mpaKey)) continue;

    const rawSentences = Array.isArray(
      (rawSelection as { sentences?: unknown }).sentences
    )
      ? ((rawSelection as { sentences: unknown[] }).sentences)
      : [];

    const sentences: PlanSentenceGroup[] = [];
    for (const rawSentence of rawSentences) {
      if (sentences.length >= PLAN_MAX_SENTENCES_PER_MPA) break;
      if (!rawSentence || typeof rawSentence !== "object") continue;
      const rawIds = (rawSentence as { accomplishmentIds?: unknown })
        .accomplishmentIds;
      if (!Array.isArray(rawIds)) continue;

      const seen = new Set<string>();
      const ids: string[] = [];
      for (const id of rawIds) {
        if (typeof id === "string" && validIds.has(id) && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      if (ids.length === 0) continue;

      const rationaleRaw = (rawSentence as { rationale?: unknown }).rationale;
      sentences.push({
        accomplishmentIds: ids,
        rationale: typeof rationaleRaw === "string" ? rationaleRaw.trim() : "",
      });
    }

    if (sentences.length > 0) {
      mpas.push({ mpaKey, sentences });
    }
  }

  return { mpas };
}

/**
 * When a plan was merged from multiple chunks it can exceed two sentences per
 * MPA. Keep the strongest groups (highest summed accomplishment score, then
 * larger combined groups) so we stay within the two-sentence EPB structure.
 */
export function trimMergedPlan(
  plan: EpbPlan,
  scoreById: Map<string, number>,
  maxSentences: number = PLAN_MAX_SENTENCES_PER_MPA
): EpbPlan {
  const groupScore = (group: PlanSentenceGroup): number =>
    group.accomplishmentIds.reduce((sum, id) => sum + (scoreById.get(id) ?? 0), 0);

  return {
    mpas: plan.mpas.map((selection) => {
      if (selection.sentences.length <= maxSentences) return selection;
      const ranked = [...selection.sentences].sort((a, b) => {
        const diff = groupScore(b) - groupScore(a);
        if (diff !== 0) return diff;
        return b.accomplishmentIds.length - a.accomplishmentIds.length;
      });
      return { ...selection, sentences: ranked.slice(0, maxSentences) };
    }),
  };
}
