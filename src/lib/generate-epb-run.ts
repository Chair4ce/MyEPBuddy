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
  /**
   * Parallel to `groups` — optional rater guidance folded into that sentence's
   * generation context (metrics nuance, emphasis, what to leave out, etc.).
   */
  notes: string[];
}
export type EditablePlan = Record<string, EditableMpaPlan>;

/** Cap free-text guidance per sentence so prompts stay bounded. */
export const SENTENCE_NOTE_MAX_CHARS = 500;

export interface MpaSelection {
  mpaKey: AcaPortfolioMpaKey;
  /** Unique accomplishment ids across all groups for this MPA. */
  accomplishmentIds: string[];
  /**
   * Per-sentence accomplishment groups (preserves combine boundaries for
   * customContext / customContext2).
   */
  groups: string[][];
  /** Parallel to non-empty `groups` — rater notes for each sentence. */
  notes: string[];
  /** 1 or 2 — drives statementCount for /api/generate. */
  sentenceCount: 1 | 2;
}

export interface SentenceSlotRef {
  mpaKey: string;
  groupIdx: number;
}

export function mpaLabel(key: string): string {
  return ENTRY_MGAS.find((m) => m.key === key)?.label ?? key;
}

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

function emptyMpaPlan(): EditableMpaPlan {
  return { enabled: false, groups: [], notes: [] };
}

function syncNotesLength(groups: string[][], notes: string[]): string[] {
  return groups.map((_, i) => notes[i] ?? "");
}

/** Convert an AI plan into the editable structure (all core MPAs present). */
export function planToEditable(plan: EpbPlan): EditablePlan {
  const editable: EditablePlan = {};
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    editable[mpaKey] = emptyMpaPlan();
  }
  for (const selection of plan.mpas) {
    if (!isAcaMpaKey(selection.mpaKey)) continue;
    const groups = selection.sentences
      .map((s) => [...s.accomplishmentIds])
      .filter((ids) => ids.length > 0);
    editable[selection.mpaKey] = {
      enabled: true,
      groups,
      notes: groups.map(() => ""),
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

    const paired = entry.groups
      .map((g, i) => ({ ids: g, note: entry.notes[i] ?? "" }))
      .filter((p) => p.ids.length > 0);
    if (paired.length === 0) continue;

    const seen = new Set<string>();
    const ids: string[] = [];
    for (const { ids: group } of paired) {
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
      groups: paired.map((p) => [...p.ids]),
      notes: paired.map((p) => p.note.trim()),
      sentenceCount: paired.length >= 2 ? 2 : 1,
    });
  }
  return selections;
}

/** Append optional rater guidance under the accomplishment body. */
export function appendSentenceNote(body: string, note: string | undefined): string {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) return body;
  const capped = trimmed.slice(0, SENTENCE_NOTE_MAX_CHARS);
  if (!body.trim()) {
    return `ADDITIONAL GUIDANCE FROM RATER:\n${capped}`;
  }
  return `${body}\n\nADDITIONAL GUIDANCE FROM RATER:\n${capped}`;
}

/** Build customContext (+ optional customContext2) from per-sentence groups. */
export function buildGroupedMpaContexts(
  groups: string[][],
  recordsById: Map<string, PlanAccomplishmentRecord>,
  notes: string[] = []
): { customContext: string; customContext2?: string } {
  const resolve = (ids: string[]) =>
    ids
      .map((id) => recordsById.get(id))
      .filter((r): r is PlanAccomplishmentRecord => !!r);

  const first = appendSentenceNote(
    buildMpaCustomContext(resolve(groups[0] ?? [])),
    notes[0]
  );
  if (groups.length < 2) {
    return { customContext: first };
  }
  const second = appendSentenceNote(
    buildMpaCustomContext(resolve(groups[1] ?? [])),
    notes[1]
  );
  return second
    ? { customContext: first, customContext2: second }
    : { customContext: first };
}

/** Swap sentence order within one MPA (notes move with groups). */
export function reorderSentenceGroups(
  editable: EditablePlan,
  mpaKey: string,
  fromIdx: number,
  toIdx: number
): EditablePlan {
  const entry = editable[mpaKey];
  if (!entry) return editable;
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= entry.groups.length ||
    toIdx >= entry.groups.length ||
    fromIdx === toIdx
  ) {
    return editable;
  }
  const groups = [...entry.groups];
  const notes = syncNotesLength(groups, entry.notes);
  const [movedGroup] = groups.splice(fromIdx, 1);
  const [movedNote] = notes.splice(fromIdx, 1);
  groups.splice(toIdx, 0, movedGroup!);
  notes.splice(toIdx, 0, movedNote!);
  return {
    ...editable,
    [mpaKey]: { ...entry, groups, notes },
  };
}

/**
 * Move one accomplishment into another sentence slot (any MPA).
 * Enables the destination MPA and creates the target group if needed (max 2).
 */
export function moveAccomplishmentToSlot(
  editable: EditablePlan,
  from: SentenceSlotRef & { id: string },
  to: SentenceSlotRef
): EditablePlan {
  if (from.mpaKey === to.mpaKey && from.groupIdx === to.groupIdx) {
    return editable;
  }

  const source = editable[from.mpaKey];
  if (!source) return editable;
  const sourceGroup = source.groups[from.groupIdx];
  if (!sourceGroup?.includes(from.id)) return editable;

  let next: EditablePlan = { ...editable };

  const stripSource = (): EditableMpaPlan => {
    const groups = source.groups.map((g, i) =>
      i === from.groupIdx ? g.filter((id) => id !== from.id) : [...g]
    );
    return {
      ...source,
      groups,
      notes: syncNotesLength(groups, source.notes),
    };
  };

  if (from.mpaKey === to.mpaKey) {
    const afterStrip = stripSource();
    let groups = afterStrip.groups.map((g) => [...g]);
    if (to.groupIdx >= groups.length) {
      if (to.groupIdx >= 2) return editable;
      while (groups.length <= to.groupIdx && groups.length < 2) {
        groups.push([]);
      }
    }
    groups = groups.map((g, i) => {
      if (i !== to.groupIdx) return g;
      return g.includes(from.id) ? g : [...g, from.id];
    });
    next = {
      ...next,
      [from.mpaKey]: {
        ...afterStrip,
        groups,
        notes: syncNotesLength(groups, afterStrip.notes),
      },
    };
    return next;
  }

  const dest = next[to.mpaKey] ?? emptyMpaPlan();
  let destGroups = dest.groups.map((g) => [...g]);
  let destNotes = syncNotesLength(destGroups, dest.notes);

  if (to.groupIdx >= destGroups.length) {
    if (to.groupIdx >= 2) return editable;
    while (destGroups.length <= to.groupIdx && destGroups.length < 2) {
      destGroups.push([]);
    }
    destNotes = syncNotesLength(destGroups, destNotes);
  }

  destGroups = destGroups.map((g, i) => {
    if (i !== to.groupIdx) return g;
    return g.includes(from.id) ? g : [...g, from.id];
  });

  next = {
    ...next,
    [from.mpaKey]: stripSource(),
    [to.mpaKey]: {
      enabled: true,
      groups: destGroups,
      notes: destNotes,
    },
  };
  return next;
}

/** List every sentence slot a chip can move into (excluding its current slot). */
export function listMoveDestinations(
  editable: EditablePlan,
  from: SentenceSlotRef
): Array<SentenceSlotRef & { label: string }> {
  const destinations: Array<SentenceSlotRef & { label: string }> = [];
  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const entry = editable[mpaKey] ?? emptyMpaPlan();
    const groupCount = Math.max(entry.groups.length, entry.enabled ? 1 : 0);
    const slots = Math.min(Math.max(groupCount, 1), 2);
    for (let groupIdx = 0; groupIdx < slots; groupIdx++) {
      if (mpaKey === from.mpaKey && groupIdx === from.groupIdx) continue;
      destinations.push({
        mpaKey,
        groupIdx,
        label: `${mpaLabel(mpaKey)} · Sentence ${groupIdx + 1}`,
      });
    }
    // Offer creating sentence 2 when the MPA only has one group so far
    if (entry.groups.length === 1) {
      destinations.push({
        mpaKey,
        groupIdx: 1,
        label: `${mpaLabel(mpaKey)} · Sentence 2 (new)`,
      });
    }
  }
  return destinations;
}

/**
 * Fused free-text for one MPA's selected accomplishments — matches the format
 * the single-statement fuse flow sends as `customContext` to /api/generate.
 * When multiple records are present, instruct the model to treat them as one
 * cumulative effort and accumulate metrics (hours, dollars, counts).
 */
export function buildMpaCustomContext(
  records: PlanAccomplishmentRecord[]
): string {
  const body = records
    .map((r) => {
      const impact = r.impact ? `. Impact: ${r.impact}` : "";
      const metrics = r.metrics ? `. Metrics: ${r.metrics}` : "";
      return `${r.action_verb}: ${r.details}${impact}${metrics}`;
    })
    .join("\n\n");
  if (records.length <= 1) return body;
  return `SAME CUMULATIVE EFFORT — rewrite as ONE statement and ACCUMULATE metrics (hours, dollars, counts) across the entries below:\n\n${body}`;
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
