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
 * Deterministic EPB sentence assignment.
 *
 * Per core MPA we want up to two sentence groups. Home (tagged) accomplishments
 * claim first: the strongest distinct action clusters become sentences; weaker
 * leftovers are stashed. Underfilled MPAs then pop from the stash using that
 * MPA's relevancy score — so a cycle heavy in Executing the Mission can still
 * fill Leading People when entries scored well on both.
 */

/** Minimum mpa_relevancy to borrow a stashed entry into another MPA. */
export const MIN_CROSS_FILL_RELEVANCY = 40;
/** Last-resort cross-fill floor when an MPA still needs another sentence. */
export const MIN_DESPERATE_CROSS_FILL_RELEVANCY = 25;
/** Synthetic home score when an entry has never been assessed. */
export const UNASSESSED_HOME_RELEVANCY = 55;

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

function normalizeVerb(verb: string): string {
  return verb.trim().toLowerCase();
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
  // Unassessed: keep with tagged MPA so they still participate in home claims.
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

/**
 * Cluster by action verb so recurring/cumulative work combines into one
 * sentence (metrics accumulate). Different verbs → different sentence groups.
 * Clusters are ordered by their best member's score for the target MPA.
 */
export function clusterByActionVerb(
  records: PlanAccomplishmentRecord[],
  mpaKey: AcaPortfolioMpaKey
): PlanAccomplishmentRecord[][] {
  const byVerb = new Map<string, PlanAccomplishmentRecord[]>();
  for (const record of records) {
    const key = normalizeVerb(record.action_verb) || `__id:${record.id}`;
    const bucket = byVerb.get(key);
    if (bucket) bucket.push(record);
    else byVerb.set(key, [record]);
  }

  const clusters = [...byVerb.values()].map((cluster) =>
    sortByMpaRelevancy(cluster, mpaKey)
  );

  clusters.sort((a, b) => {
    const aBest = relevancyForMpa(a[0]!, mpaKey);
    const bBest = relevancyForMpa(b[0]!, mpaKey);
    if (bBest !== aBest) return bBest - aBest;
    const aSum = a.reduce((sum, r) => sum + relevancyForMpa(r, mpaKey), 0);
    const bSum = b.reduce((sum, r) => sum + relevancyForMpa(r, mpaKey), 0);
    return bSum - aSum;
  });

  return clusters;
}

function groupsFromClusters(
  clusters: PlanAccomplishmentRecord[][],
  maxSentences: number,
  mpaKey: AcaPortfolioMpaKey
): { groups: PlanSentenceGroup[]; leftovers: PlanAccomplishmentRecord[] } {
  const take = clusters.slice(0, maxSentences);
  const rest = clusters.slice(maxSentences);
  const groups: PlanSentenceGroup[] = take.map((cluster) => ({
    accomplishmentIds: cluster.map((r) => r.id),
    rationale:
      cluster.length > 1
        ? `Combined ${cluster.length} related "${cluster[0]!.action_verb}" entries (${relevancyForMpa(cluster[0]!, mpaKey)}% ${mpaKey} fit)`
        : `Strong solo entry (${relevancyForMpa(cluster[0]!, mpaKey)}% ${mpaKey} fit)`,
  }));
  return { groups, leftovers: rest.flat() };
}

function claimFromPool(
  pool: PlanAccomplishmentRecord[],
  mpaKey: AcaPortfolioMpaKey,
  need: number,
  minScore: number
): { groups: PlanSentenceGroup[]; usedIds: Set<string> } {
  if (need <= 0 || pool.length === 0) {
    return { groups: [], usedIds: new Set() };
  }
  const eligible = sortByMpaRelevancy(
    pool.filter((r) => relevancyForMpa(r, mpaKey) >= minScore),
    mpaKey
  );
  if (eligible.length === 0) {
    return { groups: [], usedIds: new Set() };
  }
  const clusters = clusterByActionVerb(eligible, mpaKey);
  const { groups } = groupsFromClusters(clusters, need, mpaKey);
  const usedIds = new Set(groups.flatMap((g) => g.accomplishmentIds));
  return { groups, usedIds };
}

/**
 * Assign up to two sentence groups per core MPA using home claims + stash/pop
 * cross-fill. Each accomplishment is used at most once.
 */
export function assignEpbSentenceGroups(
  records: PlanAccomplishmentRecord[]
): EpbPlan {
  const usable = records.filter((r) => isAcaMpaKey(r.taggedMpa));
  const used = new Set<string>();
  const byMpa = new Map<AcaPortfolioMpaKey, PlanSentenceGroup[]>();
  const stash: PlanAccomplishmentRecord[] = [];

  // Pass 1 — home claims by tagged MPA. Top action clusters become sentences;
  // remaining home entries go to the stash for cross-MPA fill.
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const home = usable.filter(
      (r) => r.taggedMpa === mpaKey && !used.has(r.id)
    );
    if (home.length === 0) {
      byMpa.set(mpaKey, []);
      continue;
    }
    const clusters = clusterByActionVerb(home, mpaKey);
    const { groups, leftovers } = groupsFromClusters(
      clusters,
      PLAN_MAX_SENTENCES_PER_MPA,
      mpaKey
    );
    byMpa.set(mpaKey, groups);
    for (const group of groups) {
      for (const id of group.accomplishmentIds) used.add(id);
    }
    stash.push(...leftovers);
  }

  // Anything somehow unused (shouldn't happen for tagged ACA) joins the stash.
  for (const record of usable) {
    if (!used.has(record.id) && !stash.some((s) => s.id === record.id)) {
      stash.push(record);
    }
  }

  const takeFromStash = (
    mpaKey: AcaPortfolioMpaKey,
    need: number,
    minScore: number
  ) => {
    const { groups, usedIds } = claimFromPool(stash, mpaKey, need, minScore);
    if (groups.length === 0) return;
    const existing = byMpa.get(mpaKey) ?? [];
    byMpa.set(mpaKey, [...existing, ...groups]);
    for (const id of usedIds) {
      used.add(id);
      const idx = stash.findIndex((r) => r.id === id);
      if (idx >= 0) stash.splice(idx, 1);
    }
  };

  // Pass 2 — fill second sentences (and empty MPAs) from stash when score fits.
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const current = byMpa.get(mpaKey) ?? [];
    const need = PLAN_MAX_SENTENCES_PER_MPA - current.length;
    if (need <= 0) continue;
    takeFromStash(mpaKey, need, MIN_CROSS_FILL_RELEVANCY);
  }

  // Pass 3 — desperate fill for still-underfilled MPAs at a lower score floor
  // (covers both empty areas and MPAs stuck at a single sentence).
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const current = byMpa.get(mpaKey) ?? [];
    const need = PLAN_MAX_SENTENCES_PER_MPA - current.length;
    if (need <= 0) continue;
    takeFromStash(mpaKey, need, MIN_DESPERATE_CROSS_FILL_RELEVANCY);
  }

  return {
    mpas: ACA_PORTFOLIO_MPA_KEYS.filter(
      (key) => (byMpa.get(key) ?? []).length > 0
    ).map((mpaKey) => ({
      mpaKey,
      sentences: byMpa.get(mpaKey)!,
    })),
  };
}
