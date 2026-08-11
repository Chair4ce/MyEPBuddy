import { ENTRY_MGAS } from "@/lib/constants";
import { assignEpbSentenceGroups } from "@/lib/assign-epb-sentences";
import {
  ACA_PORTFOLIO_MPA_KEYS,
  type AcaPortfolioMpaKey,
} from "@/lib/cycle-portfolio";
import type { EpbPlan, PlanAccomplishmentRecord } from "@/lib/plan-epb";

/** Live status for each MPA while the one-shot EPB generation runs. */
export type MpaRunStatus =
  | "queued"
  | "generating"
  | "done"
  | "staged"
  | "failed"
  | "skipped";

/** How to handle MPAs whose shell section already has a real statement. */
export type ConflictPolicy = "overwrite" | "stage";

/** Editable form of the AI plan the user reviews before generating. */
export interface EditableMpaPlan {
  enabled: boolean;
  /** Each inner array is one sentence group (accomplishment ids to combine). */
  groups: string[][];
}
export type EditablePlan = Record<string, EditableMpaPlan>;

export interface MpaSelection {
  mpaKey: AcaPortfolioMpaKey;
  /** Unique accomplishment ids across all groups for this MPA. */
  accomplishmentIds: string[];
  /**
   * Per-sentence accomplishment groups (preserves combine boundaries for
   * customContext / customContext2).
   */
  groups: string[][];
  /** 1 or 2 — drives statementCount for /api/generate. */
  sentenceCount: 1 | 2;
}

export function mpaLabel(key: string): string {
  return ENTRY_MGAS.find((m) => m.key === key)?.label ?? key;
}

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

/** Convert an AI plan into the editable structure (core MPAs, enabled). */
export function planToEditable(plan: EpbPlan): EditablePlan {
  const editable: EditablePlan = {};
  for (const selection of plan.mpas) {
    if (!isAcaMpaKey(selection.mpaKey)) continue;
    editable[selection.mpaKey] = {
      enabled: true,
      groups: selection.sentences
        .map((s) => [...s.accomplishmentIds])
        .filter((ids) => ids.length > 0),
    };
  }
  return editable;
}

/**
 * Build an editable plan from accomplishment records using score-based
 * home claims + stash/pop cross-fill (up to two sentences per MPA).
 */
export function editableFromRecords(
  records: PlanAccomplishmentRecord[]
): EditablePlan {
  return planToEditable(assignEpbSentenceGroups(records));
}

/**
 * Reduce the editable plan to per-MPA generation selections: enabled MPAs with
 * at least one non-empty group, preserved group boundaries, and sentence count
 * = number of non-empty groups (capped at two).
 */
export function editableToMpaSelections(editable: EditablePlan): MpaSelection[] {
  const selections: MpaSelection[] = [];
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const entry = editable[mpaKey];
    if (!entry || !entry.enabled) continue;

    const nonEmptyGroups = entry.groups.filter((g) => g.length > 0);
    if (nonEmptyGroups.length === 0) continue;

    const seen = new Set<string>();
    const ids: string[] = [];
    for (const group of nonEmptyGroups) {
      for (const id of group) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }

    selections.push({
      mpaKey,
      accomplishmentIds: ids,
      groups: nonEmptyGroups.map((g) => [...g]),
      sentenceCount: nonEmptyGroups.length >= 2 ? 2 : 1,
    });
  }
  return selections;
}

/** Build customContext (+ optional customContext2) from per-sentence groups. */
export function buildGroupedMpaContexts(
  groups: string[][],
  recordsById: Map<string, PlanAccomplishmentRecord>
): { customContext: string; customContext2?: string } {
  const resolve = (ids: string[]) =>
    ids
      .map((id) => recordsById.get(id))
      .filter((r): r is PlanAccomplishmentRecord => !!r);

  const first = buildMpaCustomContext(resolve(groups[0] ?? []));
  if (groups.length < 2) {
    return { customContext: first };
  }
  const second = buildMpaCustomContext(resolve(groups[1] ?? []));
  return second
    ? { customContext: first, customContext2: second }
    : { customContext: first };
}

/**
 * Fused free-text for one MPA's selected accomplishments — matches the format
 * the single-statement fuse flow sends as `customContext` to /api/generate.
 */
export function buildMpaCustomContext(
  records: PlanAccomplishmentRecord[]
): string {
  return records
    .map((r) => {
      const impact = r.impact ? `. Impact: ${r.impact}` : "";
      const metrics = r.metrics ? `. Metrics: ${r.metrics}` : "";
      return `${r.action_verb}: ${r.details}${impact}${metrics}`;
    })
    .join("\n\n");
}

/**
 * Combine each version's sentence array into a single statement string, capped
 * at the MPA's sentence count. Mirrors the fuse-to-epb combine behavior.
 */
export function combineVersions(
  versionArrays: string[][],
  sentenceCount: number
): string[] {
  const combine = (statements: string[]): string | null => {
    const capped = statements.slice(0, sentenceCount).filter(Boolean);
    if (capped.length === 0) return null;
    if (capped.length === 1) return capped[0];
    const separator = capped[0].trim().endsWith(".") ? " " : ". ";
    return `${capped[0]}${separator}${capped[1]}`;
  };
  return versionArrays
    .map(combine)
    .filter((s): s is string => !!s && s.trim().length > 0);
}

/** Extract version arrays from an /api/generate response item. */
export function extractVersionArrays(mpaResult: unknown): string[][] {
  if (!mpaResult || typeof mpaResult !== "object") return [];
  const item = mpaResult as {
    statementVersions?: unknown;
    statements?: unknown;
  };
  if (
    Array.isArray(item.statementVersions) &&
    item.statementVersions.length > 0
  ) {
    return item.statementVersions as string[][];
  }
  if (Array.isArray(item.statements) && item.statements.length > 0) {
    return [item.statements as string[]];
  }
  return [];
}
