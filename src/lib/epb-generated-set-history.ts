/**
 * Rolling History for AI-generated statement sets (Revise / Generate).
 *
 * Keeps the last {@link MAX_GENERATED_STATEMENT_SETS} sets × 3 options = 9
 * statements in Snapshot History so unused alternatives remain recoverable
 * after regenerating or applying one option.
 */

export const MAX_GENERATED_STATEMENT_SETS = 3;
export const MAX_STATEMENTS_PER_GENERATED_SET = 3;
/** Manual workspace snapshots stay under this cap (AI sets use a separate budget). */
export const MAX_MANUAL_SNAPSHOTS = 10;

export type GeneratedStatementSource = "revise" | "generate";

/** Machine-readable note prefix stored on snapshot rows. */
const AI_SET_NOTE_RE =
  /^\[ai-set:(revise|generate):([^:\]]+):(\d+)\]\s*(.*)$/;

export type SnapshotHistoryItem = {
  id: string;
  text: string;
  note: string | null;
  created_at: string;
};

export type SnapshotHistoryAiSetGroup = {
  kind: "ai-set";
  key: string;
  batchId: string;
  source: GeneratedStatementSource;
  /** e.g. "Generated · Revise" */
  title: string;
  created_at: string;
  items: Array<SnapshotHistoryItem & { optionIndex: number }>;
};

export type SnapshotHistoryManualGroup = {
  kind: "manual";
  key: string;
  created_at: string;
  item: SnapshotHistoryItem;
};

export type SnapshotHistoryGroup =
  | SnapshotHistoryAiSetGroup
  | SnapshotHistoryManualGroup;

export function isGeneratedSetSnapshotNote(note: string | null | undefined): boolean {
  return !!note && note.startsWith("[ai-set:");
}

export function buildGeneratedSetSnapshotNote(
  source: GeneratedStatementSource,
  batchId: string,
  optionIndex: number,
): string {
  const label = source === "revise" ? "Revise" : "Generate";
  return `[ai-set:${source}:${batchId}:${optionIndex}] Generated · ${label} · Option ${optionIndex}`;
}

export function parseGeneratedSetNote(
  note: string | null | undefined,
): {
  source: GeneratedStatementSource;
  batchId: string;
  optionIndex: number;
  label: string;
} | null {
  if (!note) return null;
  const match = AI_SET_NOTE_RE.exec(note);
  if (!match) return null;
  return {
    source: match[1] as GeneratedStatementSource,
    batchId: match[2],
    optionIndex: Number(match[3]),
    label: match[4] || "Generated",
  };
}

export function getGeneratedSetDisplayLabel(note: string | null | undefined): string | null {
  const parsed = parseGeneratedSetNote(note);
  if (parsed) return parsed.label;
  return isGeneratedSetSnapshotNote(note) ? "Generated" : null;
}

export function parseGeneratedSetBatchId(note: string | null | undefined): string | null {
  return parseGeneratedSetNote(note)?.batchId ?? null;
}

/** Newest-first list of unique AI batch ids (by newest snapshot in each batch). */
export function listGeneratedSetBatchIdsNewestFirst(
  snapshots: Array<{ note: string | null; created_at: string }>,
): string[] {
  const latestByBatch = new Map<string, number>();
  for (const snap of snapshots) {
    const batchId = parseGeneratedSetBatchId(snap.note);
    if (!batchId) continue;
    const t = new Date(snap.created_at).getTime();
    const prev = latestByBatch.get(batchId);
    if (prev === undefined || t > prev) latestByBatch.set(batchId, t);
  }
  return [...latestByBatch.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([batchId]) => batchId);
}

/** Snapshot ids belonging to AI sets older than the newest N batches. */
export function idsOfGeneratedSetsBeyondLimit(
  snapshots: Array<{ id: string; note: string | null; created_at: string }>,
  maxSets: number = MAX_GENERATED_STATEMENT_SETS,
): string[] {
  const keep = new Set(listGeneratedSetBatchIdsNewestFirst(snapshots).slice(0, maxSets));
  return snapshots
    .filter((snap) => {
      const batchId = parseGeneratedSetBatchId(snap.note);
      return batchId !== null && !keep.has(batchId);
    })
    .map((snap) => snap.id);
}

/** Oldest manual (non-AI) snapshot ids beyond the manual cap. */
export function idsOfManualSnapshotsBeyondLimit(
  snapshots: Array<{ id: string; note: string | null; created_at: string }>,
  maxManual: number = MAX_MANUAL_SNAPSHOTS,
): string[] {
  const manual = snapshots
    .filter((snap) => !isGeneratedSetSnapshotNote(snap.note))
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  if (manual.length <= maxManual) return [];
  return manual.slice(0, manual.length - maxManual).map((snap) => snap.id);
}

/**
 * Group flat snapshots into History rows: one expandable AI set per batch,
 * one row per manual/workspace snapshot. Newest groups first.
 */
export function groupSnapshotsForHistory(
  snapshots: SnapshotHistoryItem[],
): SnapshotHistoryGroup[] {
  const aiByBatch = new Map<
    string,
    {
      source: GeneratedStatementSource;
      items: Array<SnapshotHistoryItem & { optionIndex: number }>;
    }
  >();
  const manuals: SnapshotHistoryManualGroup[] = [];

  for (const snap of snapshots) {
    const parsed = parseGeneratedSetNote(snap.note);
    if (!parsed) {
      manuals.push({
        kind: "manual",
        key: `manual:${snap.id}`,
        created_at: snap.created_at,
        item: snap,
      });
      continue;
    }
    const existing = aiByBatch.get(parsed.batchId);
    if (existing) {
      existing.items.push({ ...snap, optionIndex: parsed.optionIndex });
    } else {
      aiByBatch.set(parsed.batchId, {
        source: parsed.source,
        items: [{ ...snap, optionIndex: parsed.optionIndex }],
      });
    }
  }

  const aiGroups: SnapshotHistoryAiSetGroup[] = [...aiByBatch.entries()].map(
    ([batchId, { source, items }]) => {
      const sorted = [...items].sort((a, b) => a.optionIndex - b.optionIndex);
      const newest = sorted.reduce((acc, item) =>
        new Date(item.created_at).getTime() > new Date(acc.created_at).getTime()
          ? item
          : acc,
      );
      const sourceLabel = source === "revise" ? "Revise" : "Generate";
      return {
        kind: "ai-set" as const,
        key: `ai-set:${batchId}`,
        batchId,
        source,
        title: `Generated · ${sourceLabel}`,
        created_at: newest.created_at,
        items: sorted,
      };
    },
  );

  return [...aiGroups, ...manuals].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
