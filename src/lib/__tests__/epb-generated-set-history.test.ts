import { describe, expect, it } from "vitest";
import {
  MAX_GENERATED_STATEMENT_SETS,
  buildGeneratedSetSnapshotNote,
  getGeneratedSetDisplayLabel,
  groupSnapshotsForHistory,
  idsOfGeneratedSetsBeyondLimit,
  idsOfManualSnapshotsBeyondLimit,
  isGeneratedSetSnapshotNote,
  listGeneratedSetBatchIdsNewestFirst,
  parseGeneratedSetBatchId,
} from "@/lib/epb-generated-set-history";

describe("epb-generated-set-history", () => {
  it("builds and parses generated-set notes", () => {
    const note = buildGeneratedSetSnapshotNote("revise", "batch-1", 2);
    expect(isGeneratedSetSnapshotNote(note)).toBe(true);
    expect(parseGeneratedSetBatchId(note)).toBe("batch-1");
    expect(getGeneratedSetDisplayLabel(note)).toBe("Generated · Revise · Option 2");
  });

  it("keeps only the newest 3 AI sets when pruning", () => {
    const snaps = [
      { id: "a1", note: buildGeneratedSetSnapshotNote("generate", "b1", 1), created_at: "2026-01-01T00:00:00Z" },
      { id: "a2", note: buildGeneratedSetSnapshotNote("generate", "b1", 2), created_at: "2026-01-01T00:00:01Z" },
      { id: "b1", note: buildGeneratedSetSnapshotNote("revise", "b2", 1), created_at: "2026-01-02T00:00:00Z" },
      { id: "c1", note: buildGeneratedSetSnapshotNote("revise", "b3", 1), created_at: "2026-01-03T00:00:00Z" },
      { id: "d1", note: buildGeneratedSetSnapshotNote("revise", "b4", 1), created_at: "2026-01-04T00:00:00Z" },
      { id: "manual", note: null, created_at: "2026-01-05T00:00:00Z" },
    ];

    expect(listGeneratedSetBatchIdsNewestFirst(snaps)).toEqual(["b4", "b3", "b2", "b1"]);
    expect(idsOfGeneratedSetsBeyondLimit(snaps, MAX_GENERATED_STATEMENT_SETS).sort()).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("prunes only manual snapshots against the manual cap", () => {
    const snaps = [
      { id: "m1", note: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "m2", note: null, created_at: "2026-01-02T00:00:00Z" },
      { id: "m3", note: null, created_at: "2026-01-03T00:00:00Z" },
      {
        id: "ai",
        note: buildGeneratedSetSnapshotNote("revise", "b1", 1),
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    expect(idsOfManualSnapshotsBeyondLimit(snaps, 2)).toEqual(["m1"]);
  });

  it("groups AI sets into expandable rows and keeps manuals flat", () => {
    const groups = groupSnapshotsForHistory([
      {
        id: "a1",
        text: "one",
        note: buildGeneratedSetSnapshotNote("revise", "b1", 1),
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "a3",
        text: "three",
        note: buildGeneratedSetSnapshotNote("revise", "b1", 3),
        created_at: "2026-01-01T00:00:02Z",
      },
      {
        id: "a2",
        text: "two",
        note: buildGeneratedSetSnapshotNote("revise", "b1", 2),
        created_at: "2026-01-01T00:00:01Z",
      },
      {
        id: "m1",
        text: "workspace",
        note: null,
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        id: "g1",
        text: "gen",
        note: buildGeneratedSetSnapshotNote("generate", "b2", 1),
        created_at: "2026-01-03T00:00:00Z",
      },
    ]);

    expect(groups.map((g) => g.kind)).toEqual(["ai-set", "manual", "ai-set"]);
    expect(groups[0]).toMatchObject({
      kind: "ai-set",
      title: "Generated · Generate",
      batchId: "b2",
    });
    expect(groups[1]).toMatchObject({ kind: "manual" });
    expect(groups[2]).toMatchObject({
      kind: "ai-set",
      title: "Generated · Revise",
      batchId: "b1",
    });
    if (groups[2].kind === "ai-set") {
      expect(groups[2].items.map((i) => i.optionIndex)).toEqual([1, 2, 3]);
      expect(groups[2].items.map((i) => i.text)).toEqual(["one", "two", "three"]);
    }
  });
});
