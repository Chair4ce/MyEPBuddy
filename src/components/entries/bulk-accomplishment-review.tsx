"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { DEFAULT_ACTION_VERBS, ENTRY_MGAS } from "@/lib/constants";
import {
  applyCombineToDrafts,
  type BulkAccomplishmentDraft,
} from "@/lib/extract-accomplishments";
import { cn } from "@/lib/utils";
import { motionPressOnly, motionTransitionInteractive } from "@/lib/motion/classes";
import {
  AlertTriangle,
  CheckCircle2,
  Combine,
  Trash2,
} from "lucide-react";

interface BulkAccomplishmentReviewProps {
  drafts: BulkAccomplishmentDraft[];
  onDraftsChange: (drafts: BulkAccomplishmentDraft[]) => void;
  onBack: () => void;
  onSaveOnly: () => void;
  onSaveAndGenerate: () => void;
  isSubmitting: boolean;
  canGenerateEpb: boolean;
}

export function BulkAccomplishmentReview({
  drafts,
  onDraftsChange,
  onBack,
  onSaveOnly,
  onSaveAndGenerate,
  isSubmitting,
  canGenerateEpb,
}: BulkAccomplishmentReviewProps) {
  const included = drafts.filter((d) => d.included);
  const combineSelected = drafts.filter(
    (d) => d.selectedForCombine && d.included,
  );
  const canCombine = combineSelected.length >= 2;
  const validIncluded = included.filter(
    (d) => d.action_verb.trim() && d.details.trim() && d.mpa,
  );
  const needsReviewCount = drafts.filter(
    (d) =>
      d.included &&
      (d.confidence < 0.7 || !d.mpa || !d.action_verb.trim() || !d.details.trim()),
  ).length;

  function updateDraft(id: string, updates: Partial<BulkAccomplishmentDraft>) {
    onDraftsChange(drafts.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  }

  function removeDraft(id: string) {
    onDraftsChange(drafts.filter((d) => d.id !== id));
  }

  function handleCombine() {
    if (!canCombine) return;
    onDraftsChange(applyCombineToDrafts(drafts));
  }

  function getMpaLabel(key: string): string {
    return ENTRY_MGAS.find((m) => m.key === key)?.label || key;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">
              {drafts.length} item{drafts.length !== 1 ? "s" : ""} extracted
            </h3>
            <Badge variant="secondary" className="text-xs">
              {validIncluded.length} included
            </Badge>
            {needsReviewCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
              >
                <AlertTriangle className="mr-1 size-3" />
                {needsReviewCount} need{needsReviewCount === 1 ? "s" : ""} review
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canCombine || isSubmitting}
            onClick={handleCombine}
            className={cn(motionPressOnly)}
            aria-label="Combine selected accomplishments"
          >
            <Combine className="mr-1.5 size-3.5" />
            Combine ({combineSelected.length})
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Edit fields, uncheck Include to skip, or select 2+ rows and Combine to
          stack metrics into one entry.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1 -mx-6 px-6">
        <div className="space-y-4 py-4">
          {drafts.map((draft, index) => {
            const weak =
              draft.confidence < 0.7 ||
              !draft.action_verb.trim() ||
              !draft.details.trim();
            return (
              <div
                key={draft.id}
                className={cn(
                  "space-y-3 rounded-lg border p-4",
                  motionTransitionInteractive,
                  !draft.included && "opacity-60",
                  weak && draft.included
                    ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"
                    : "border-border bg-card",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.included}
                        onCheckedChange={(checked) =>
                          updateDraft(draft.id, {
                            included: checked === true,
                            selectedForCombine:
                              checked === true
                                ? draft.selectedForCombine
                                : false,
                          })
                        }
                        aria-label={`Include accomplishment ${index + 1}`}
                      />
                      Include
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.selectedForCombine}
                        disabled={!draft.included}
                        onCheckedChange={(checked) =>
                          updateDraft(draft.id, {
                            selectedForCombine: checked === true,
                          })
                        }
                        aria-label={`Select accomplishment ${index + 1} for combine`}
                      />
                      Combine
                    </label>
                    {draft.mpa ? (
                      <Badge
                        variant={draft.confidence >= 0.7 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {draft.confidence >= 0.7 ? (
                          <CheckCircle2 className="mr-1 size-3" />
                        ) : (
                          <AlertTriangle className="mr-1 size-3" />
                        )}
                        {getMpaLabel(draft.mpa)}
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("size-8 text-destructive", motionPressOnly)}
                    onClick={() => removeDraft(draft.id)}
                    disabled={isSubmitting}
                    aria-label={`Remove accomplishment ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`verb-${draft.id}`}>Action verb *</Label>
                    <ComboboxInput
                      value={draft.action_verb}
                      onChange={(value) =>
                        updateDraft(draft.id, { action_verb: value })
                      }
                      options={DEFAULT_ACTION_VERBS}
                      placeholder="Led"
                      aria-label={`Action verb for accomplishment ${index + 1}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`mpa-${draft.id}`}>MPA *</Label>
                    <Select
                      value={draft.mpa}
                      onValueChange={(value) =>
                        updateDraft(draft.id, { mpa: value })
                      }
                    >
                      <SelectTrigger
                        id={`mpa-${draft.id}`}
                        aria-label={`MPA for accomplishment ${index + 1}`}
                      >
                        <SelectValue placeholder="Select MPA" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_MGAS.map((mpa) => (
                          <SelectItem key={mpa.key} value={mpa.key}>
                            {mpa.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`details-${draft.id}`}>Details *</Label>
                  <Textarea
                    id={`details-${draft.id}`}
                    value={draft.details}
                    onChange={(e) =>
                      updateDraft(draft.id, { details: e.target.value })
                    }
                    rows={3}
                    aria-label={`Details for accomplishment ${index + 1}`}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`impact-${draft.id}`}>Impact</Label>
                    <Textarea
                      id={`impact-${draft.id}`}
                      value={draft.impact}
                      onChange={(e) =>
                        updateDraft(draft.id, { impact: e.target.value })
                      }
                      rows={2}
                      aria-label={`Impact for accomplishment ${index + 1}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`metrics-${draft.id}`}>Metrics</Label>
                    <Textarea
                      id={`metrics-${draft.id}`}
                      value={draft.metrics}
                      onChange={(e) =>
                        updateDraft(draft.id, { metrics: e.target.value })
                      }
                      rows={2}
                      aria-label={`Metrics for accomplishment ${index + 1}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`date-${draft.id}`}>Date</Label>
                    <Input
                      id={`date-${draft.id}`}
                      type="date"
                      value={draft.date}
                      onChange={(e) =>
                        updateDraft(draft.id, { date: e.target.value })
                      }
                      aria-label={`Date for accomplishment ${index + 1}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`cycle-${draft.id}`}>Cycle year</Label>
                    <Input
                      id={`cycle-${draft.id}`}
                      type="number"
                      value={draft.cycle_year}
                      onChange={(e) =>
                        updateDraft(draft.id, {
                          cycle_year:
                            Number.parseInt(e.target.value, 10) ||
                            draft.cycle_year,
                        })
                      }
                      aria-label={`Cycle year for accomplishment ${index + 1}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isSubmitting}
          className={cn(motionPressOnly)}
        >
          Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onSaveOnly}
            disabled={isSubmitting || validIncluded.length === 0}
            className={cn(motionPressOnly)}
          >
            Save to entries
          </Button>
          <Button
            type="button"
            onClick={onSaveAndGenerate}
            disabled={
              isSubmitting || validIncluded.length === 0 || !canGenerateEpb
            }
            className={cn(motionPressOnly)}
            title={
              !canGenerateEpb
                ? "Generate EPB is available for enlisted ratees"
                : undefined
            }
          >
            Save & open Generate EPB
          </Button>
        </div>
      </div>
    </div>
  );
}
