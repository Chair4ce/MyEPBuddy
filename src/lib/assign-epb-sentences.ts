import {
  ACA_PORTFOLIO_MPA_KEYS,
  type AcaPortfolioMpaKey,
} from "@/lib/cycle-portfolio";
import {
  PLAN_MAX_SENTENCES_PER_MPA,
  type EpbPlan,
  type PlanAccomplishmentRecord,
  type PlanSentenceGroup,
} from "@/lib/plan-epb";

/**
 * Score-based candidate allocation for Generate EPB.
 *
 * Decides WHICH accomplishments belong to WHICH MPA (home claims + stash/pop
 * cross-fill). It does NOT decide combine-vs-split — that requires LLM judgment
 * of action → result → impact similarity (users won't use consistent verbs).
 */

/** Minimum mpa_relevancy to borrow a stashed entry into another MPA. */
export const MIN_CROSS_FILL_RELEVANCY = 40;
/** Last-resort cross-fill floor when an MPA still needs candidates. */
export const MIN_DESPERATE_CROSS_FILL_RELEVANCY = 25;
/** Synthetic home score when an entry has never been assessed. */
export const UNASSESSED_HOME_RELEVANCY = 55;
/**
 * Max candidates parked on one MPA before leftovers go to the stash.
 * High enough for the LLM to find two strong (possibly cumulative) sentences.
 */
export const MAX_CANDIDATES_PER_MPA = 6;
/** Prefer at least this many candidates per MPA before cross-fill stops. */
export const TARGET_CANDIDATES_PER_MPA = 2;

export type EpbCandidatePools = Record<AcaPortfolioMpaKey, string[]>;

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

/** Relevancy of a record for a target MPA (0–100). */
export function relevancyForMpa(
  record: PlanAccomplishmentRecord,
  mpaKey: AcaPortfolioMpaKey
): number {
  if (record.mpaRelevancy) {
    const score = record.mpaRelevancy[mpaKey];
    return typeof score === "number" ? score : 0;
  }
  return record.taggedMpa === mpaKey ? UNASSESSED_HOME_RELEVANCY : 0;
}

function overallTieBreak(record: PlanAccomplishmentRecord): number {
  return record.overallScore ?? 0;
}

/** Sort strongest → weakest for a target MPA. */
export function sortByMpaRelevancy(
  records: PlanAccomplishmentRecord[],
  mpaKey: AcaPortfolioMpaKey
): PlanAccomplishmentRecord[] {
  return [...records].sort((a, b) => {
    const diff = relevancyForMpa(b, mpaKey) - relevancyForMpa(a, mpaKey);
    if (diff !== 0) return diff;
    return overallTieBreak(b) - overallTieBreak(a);
  });
}

function emptyPools(): EpbCandidatePools {
  return {
    executing_mission: [],
    leading_people: [],
    managing_resources: [],
    improving_unit: [],
  };
}

/**
 * Allocate accomplishment ids to core MPAs by assessment fit.
 * Home (tagged) entries claim first up to MAX_CANDIDATES_PER_MPA; leftovers
 * stash and fill under-covered MPAs by that MPA's relevancy score.
 */
export function allocateEpbCandidatePools(
  records: PlanAccomplishmentRecord[]
): EpbCandidatePools {
  const usable = records.filter((r) => isAcaMpaKey(r.taggedMpa));
  const used = new Set<string>();
  const pools = emptyPools();
  const stash: PlanAccomplishmentRecord[] = [];

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const home = sortByMpaRelevancy(
      usable.filter((r) => r.taggedMpa === mpaKey && !used.has(r.id)),
      mpaKey
    );
    const keep = home.slice(0, MAX_CANDIDATES_PER_MPA);
    const leftover = home.slice(MAX_CANDIDATES_PER_MPA);
    pools[mpaKey] = keep.map((r) => r.id);
    for (const r of keep) used.add(r.id);
    stash.push(...leftover);
  }

  for (const record of usable) {
    if (!used.has(record.id) && !stash.some((s) => s.id === record.id)) {
      stash.push(record);
    }
  }

  const takeFromStash = (mpaKey: AcaPortfolioMpaKey, need: number, minScore: number) => {
    if (need <= 0) return;
    const eligible = sortByMpaRelevancy(
      stash.filter((r) => relevancyForMpa(r, mpaKey) >= minScore),
      mpaKey
    ).slice(0, need);
    for (const record of eligible) {
      pools[mpaKey].push(record.id);
      used.add(record.id);
      const idx = stash.findIndex((r) => r.id === record.id);
      if (idx >= 0) stash.splice(idx, 1);
    }
  };

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const need = TARGET_CANDIDATES_PER_MPA - pools[mpaKey].length;
    if (need > 0) takeFromStash(mpaKey, need, MIN_CROSS_FILL_RELEVANCY);
  }

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const need = TARGET_CANDIDATES_PER_MPA - pools[mpaKey].length;
    if (need > 0) takeFromStash(mpaKey, need, MIN_DESPERATE_CROSS_FILL_RELEVANCY);
  }

  // Cap after cross-fill so no MPA balloons.
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    if (pools[mpaKey].length > MAX_CANDIDATES_PER_MPA) {
      pools[mpaKey] = pools[mpaKey].slice(0, MAX_CANDIDATES_PER_MPA);
    }
  }

  return pools;
}

/**
 * Offline fallback when the LLM grouping step is unavailable: park the top
 * relevancy ids as singleton sentence groups (no verb/ARI combine). Prefer the
 * LLM path in production so cumulative efforts can merge.
 */
export function poolsToFallbackPlan(
  pools: EpbCandidatePools,
  records: PlanAccomplishmentRecord[]
): EpbPlan {
  const byId = new Map(records.map((r) => [r.id, r] as const));
  const mpas: EpbPlan["mpas"] = [];

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const ids = pools[mpaKey];
    if (ids.length === 0) continue;
    const ranked = sortByMpaRelevancy(
      ids.map((id) => byId.get(id)).filter((r): r is PlanAccomplishmentRecord => !!r),
      mpaKey
    );
    const sentences: PlanSentenceGroup[] = ranked
      .slice(0, PLAN_MAX_SENTENCES_PER_MPA)
      .map((r) => ({
        accomplishmentIds: [r.id],
        rationale: `Strong ${mpaKey} candidate (${relevancyForMpa(r, mpaKey)}% fit) — combine step skipped`,
      }));
    if (sentences.length > 0) {
      mpas.push({ mpaKey, sentences });
    }
  }

  return { mpas };
}

/**
 * @deprecated Prefer allocateEpbCandidatePools + LLM ARI grouping.
 * Fallback-only: score pools → singleton sentence groups.
 */
export function assignEpbSentenceGroups(
  records: PlanAccomplishmentRecord[]
): EpbPlan {
  return poolsToFallbackPlan(allocateEpbCandidatePools(records), records);
}
