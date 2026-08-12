"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listMoveDestinations,
  mpaLabel,
  moveAccomplishmentToSlot,
  reorderSentenceGroups,
  SENTENCE_NOTE_MAX_CHARS,
  type ConflictPolicy,
  type EditablePlan,
} from "@/lib/generate-epb-run";
import { ACA_PORTFOLIO_MPA_KEYS } from "@/lib/cycle-portfolio";
import {
  motionEnter,
  motionEnterDurList,
  motionInputFocus,
  motionListEnterStagger,
  motionPressOnly,
  motionSurfaceCard,
} from "@/lib/motion/classes";
import { cn } from "@/lib/utils";
import type { PlanAccomplishmentRecord } from "@/lib/plan-epb";
import {
  ArrowDown,
  ArrowUp,
  FileWarning,
  Plus,
  X,
} from "lucide-react";

export interface GenerateEpbReviewPanelProps {
  editable: EditablePlan;
  onEditableChange: (next: EditablePlan) => void;
  records: PlanAccomplishmentRecord[];
  rationaleByMpa: Record<string, string>;
  conflictingMpas: string[];
  conflictPolicy: ConflictPolicy;
  onConflictPolicyChange: (policy: ConflictPolicy) => void;
  chipLabel: (id: string) => string;
}

export function GenerateEpbReviewPanel({
  editable,
  onEditableChange,
  records,
  rationaleByMpa,
  conflictingMpas,
  conflictPolicy,
  onConflictPolicyChange,
  chipLabel,
}: GenerateEpbReviewPanelProps) {
  const updateMpa = (
    mpaKey: string,
    updater: (prev: EditablePlan[string]) => EditablePlan[string]
  ) => {
    onEditableChange({
      ...editable,
      [mpaKey]: updater(editable[mpaKey]),
    });
  };

  const removeId = (mpaKey: string, groupIdx: number, id: string) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIdx ? g.filter((x) => x !== id) : g
      ),
    }));

  const addId = (mpaKey: string, groupIdx: number, id: string) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIdx && !g.includes(id) ? [...g, id] : g
      ),
    }));

  const removeGroup = (mpaKey: string, groupIdx: number) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.filter((_, i) => i !== groupIdx),
      notes: prev.notes.filter((_, i) => i !== groupIdx),
    }));

  const addGroup = (mpaKey: string) =>
    updateMpa(mpaKey, (prev) =>
      prev.groups.length >= 2
        ? prev
        : {
            ...prev,
            groups: [...prev.groups, []],
            notes: [...prev.notes.slice(0, prev.groups.length), ""],
          }
    );

  const setNote = (mpaKey: string, groupIdx: number, value: string) =>
    updateMpa(mpaKey, (prev) => {
      const notes = prev.groups.map((_, i) => prev.notes[i] ?? "");
      notes[groupIdx] = value.slice(0, SENTENCE_NOTE_MAX_CHARS);
      return { ...prev, notes };
    });

  const toggleMpa = (mpaKey: string) =>
    updateMpa(mpaKey, (prev) => ({ ...prev, enabled: !prev.enabled }));

  const moveId = (
    mpaKey: string,
    groupIdx: number,
    id: string,
    destValue: string
  ) => {
    const [destMpa, destGroupRaw] = destValue.split("::");
    const destGroupIdx = Number(destGroupRaw);
    if (!destMpa || Number.isNaN(destGroupIdx)) return;
    onEditableChange(
      moveAccomplishmentToSlot(
        editable,
        { mpaKey, groupIdx, id },
        { mpaKey: destMpa, groupIdx: destGroupIdx }
      )
    );
  };

  const selectionsEmpty = Object.values(editable).every(
    (entry) =>
      !entry.enabled || entry.groups.every((g) => g.length === 0)
  );

  return (
    <div className="flex flex-col gap-4">
      {conflictingMpas.length > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <FileWarning className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {conflictingMpas.length} area
                {conflictingMpas.length === 1 ? "" : "s"} already{" "}
                {conflictingMpas.length === 1 ? "has" : "have"} a statement
              </p>
              <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                {conflictingMpas.map(mpaLabel).join(", ")}
              </p>
              <div
                className="mt-3 grid grid-cols-2 gap-2"
                role="group"
                aria-label="What to do with existing statements"
              >
                {(["overwrite", "stage"] as const).map((policy) => (
                  <button
                    key={policy}
                    type="button"
                    onClick={() => onConflictPolicyChange(policy)}
                    aria-pressed={conflictPolicy === policy}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-medium",
                      motionPressOnly,
                      conflictPolicy === policy
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    )}
                  >
                    {policy === "overwrite"
                      ? "Overwrite them"
                      : "Keep & stage new"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectionsEmpty && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No performance areas selected. Enable at least one below.
        </p>
      )}

      {ACA_PORTFOLIO_MPA_KEYS.map((mpaKey, index) => {
        const entry = editable[mpaKey];
        if (!entry) return null;
        const usedIds = new Set(entry.groups.flat());
        const available = records.filter((r) => !usedIds.has(r.id));
        const sentenceCount = entry.groups.filter((g) => g.length > 0).length;

        return (
          <section
            key={mpaKey}
            className={cn(
              "rounded-xl border bg-background p-4 sm:p-5",
              motionSurfaceCard,
              motionEnter,
              motionEnterDurList,
              !entry.enabled && "opacity-60"
            )}
            style={motionListEnterStagger(index)}
          >
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2.5">
                <Checkbox
                  checked={entry.enabled}
                  onCheckedChange={() => toggleMpa(mpaKey)}
                  aria-label={`Include ${mpaLabel(mpaKey)}`}
                />
                <span className="text-sm font-semibold">
                  {mpaLabel(mpaKey)}
                </span>
              </label>
              <Badge variant="outline" className="text-[10px]">
                {sentenceCount || 0} sentence
                {sentenceCount === 1 ? "" : "s"}
              </Badge>
            </div>

            {rationaleByMpa[mpaKey] && (
              <p className="mt-2 text-xs italic text-muted-foreground leading-snug">
                {rationaleByMpa[mpaKey]}
              </p>
            )}

            {entry.enabled && (
              <div className="mt-3 space-y-3">
                {entry.groups.map((group, groupIdx) => {
                  const note = entry.notes[groupIdx] ?? "";
                  const destinations = listMoveDestinations(editable, {
                    mpaKey,
                    groupIdx,
                  });

                  return (
                    <div
                      key={`${mpaKey}-g${groupIdx}`}
                      className="rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Sentence {groupIdx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn("size-7", motionPressOnly)}
                            disabled={groupIdx === 0}
                            onClick={() =>
                              onEditableChange(
                                reorderSentenceGroups(
                                  editable,
                                  mpaKey,
                                  groupIdx,
                                  groupIdx - 1
                                )
                              )
                            }
                            aria-label={`Move sentence ${groupIdx + 1} up`}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn("size-7", motionPressOnly)}
                            disabled={groupIdx >= entry.groups.length - 1}
                            onClick={() =>
                              onEditableChange(
                                reorderSentenceGroups(
                                  editable,
                                  mpaKey,
                                  groupIdx,
                                  groupIdx + 1
                                )
                              )
                            }
                            aria-label={`Move sentence ${groupIdx + 1} down`}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <button
                            type="button"
                            onClick={() => removeGroup(mpaKey, groupIdx)}
                            className="ml-1 text-xs text-muted-foreground hover:text-destructive"
                            aria-label={`Remove sentence ${groupIdx + 1}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {group.map((id) => (
                          <div
                            key={id}
                            className="flex w-full flex-col gap-1.5 rounded-md border bg-background px-2 py-1.5 sm:flex-row sm:items-start"
                          >
                            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs leading-snug">
                              {chipLabel(id)}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {destinations.length > 0 && (
                                <Select
                                  value=""
                                  onValueChange={(dest) =>
                                    moveId(mpaKey, groupIdx, id, dest)
                                  }
                                >
                                  <SelectTrigger
                                    className="h-7 w-[7.5rem] text-[10px]"
                                    aria-label={`Move ${chipLabel(id)} to another sentence`}
                                  >
                                    <span className="text-muted-foreground">
                                      Move to…
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {destinations.map((dest) => (
                                      <SelectItem
                                        key={`${dest.mpaKey}-${dest.groupIdx}`}
                                        value={`${dest.mpaKey}::${dest.groupIdx}`}
                                      >
                                        {dest.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <button
                                type="button"
                                onClick={() => removeId(mpaKey, groupIdx, id)}
                                aria-label={`Remove ${chipLabel(id)}`}
                                className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {group.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Add an accomplishment to this sentence.
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <label
                          htmlFor={`sentence-note-${mpaKey}-${groupIdx}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Extra context for this sentence{" "}
                          <span className="font-normal">(optional)</span>
                        </label>
                        <Textarea
                          id={`sentence-note-${mpaKey}-${groupIdx}`}
                          value={note}
                          onChange={(e) =>
                            setNote(mpaKey, groupIdx, e.target.value)
                          }
                          rows={2}
                          placeholder="e.g., Emphasize the 3-week early finish; leave out the temporary manning detail."
                          aria-label={`Extra context for ${mpaLabel(mpaKey)} sentence ${groupIdx + 1}`}
                          className={cn(
                            "min-h-[4rem] resize-y text-sm",
                            motionInputFocus
                          )}
                        />
                        <div className="flex justify-end">
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {note.length}/{SENTENCE_NOTE_MAX_CHARS}
                          </span>
                        </div>
                      </div>

                      {available.length > 0 && (
                        <div className="mt-2">
                          <Select
                            value=""
                            onValueChange={(id) =>
                              addId(mpaKey, groupIdx, id)
                            }
                          >
                            <SelectTrigger
                              className="h-8 text-xs"
                              aria-label={`Add accomplishment to sentence ${groupIdx + 1}`}
                            >
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Plus className="size-3.5" />
                                Add accomplishment
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {available.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {chipLabel(r.id)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
                {entry.groups.length === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => addGroup(mpaKey)}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Add sentence
                  </Button>
                ) : entry.groups.length < 2 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => addGroup(mpaKey)}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Add second sentence
                  </Button>
                ) : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
