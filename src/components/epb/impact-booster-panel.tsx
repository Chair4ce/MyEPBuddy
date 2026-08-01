"use client";

import { useId, useState, type ElementType } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  hasImpactBoosterContent,
  impactBoosterDraftKey,
  impactStrengthBand,
  impactStrengthLabel,
  normalizeImpactBooster,
  promptsForSentence,
  IMPACT_BOOSTER_FREEFORM_MAX,
  buildImpactBoosterFromDrafts,
  type ImpactBoosterDraftFields,
} from "@/lib/impact-booster";
import {
  STEWARDSHIP_HINTS,
  STEWARDSHIP_LABELS,
  STEWARDSHIP_PLACEHOLDERS,
} from "@/lib/stewardship-impact";
import {
  hasSeenImpactBoosterIntro,
  markImpactBoosterIntroSeen,
} from "@/lib/impact-booster-intro";
import type { ImpactBoosterState, ImpactLever } from "@/types/database";
import type { ImpactBoosterPrompt } from "@/stores/epb-shell-store";
import {
  Clock,
  DollarSign,
  Recycle,
  Loader2,
  Trash2,
  Save,
  TrendingUp,
  Lightbulb,
  ChevronDown,
} from "lucide-react";

/** Short AF-stewardship placeholders shared with Entries intake. */
const LEVER_META: Record<
  ImpactLever,
  { label: string; icon: ElementType; placeholder: string; hint: string }
> = {
  time: {
    label: STEWARDSHIP_LABELS.time,
    icon: Clock,
    placeholder: STEWARDSHIP_PLACEHOLDERS.time,
    hint: STEWARDSHIP_HINTS.time,
  },
  money: {
    label: STEWARDSHIP_LABELS.money,
    icon: DollarSign,
    placeholder: STEWARDSHIP_PLACEHOLDERS.money,
    hint: STEWARDSHIP_HINTS.money,
  },
  resources: {
    label: STEWARDSHIP_LABELS.resources,
    icon: Recycle,
    placeholder: STEWARDSHIP_PLACEHOLDERS.resources,
    hint: STEWARDSHIP_HINTS.resources,
  },
};

function StrengthChip({ strength }: { strength: number }) {
  const band = impactStrengthBand(strength);
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] h-5 px-1.5",
        band === "strong" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        band === "fair" && "bg-amber-500/10 text-amber-700 border-amber-500/20",
        band === "weak" && "bg-rose-500/10 text-rose-600 border-rose-500/20"
      )}
    >
      <TrendingUp className="size-3" />
      {impactStrengthLabel(band)}
    </Badge>
  );
}

function shortLabel(prompt: ImpactBoosterPrompt): string {
  if (prompt.lever && LEVER_META[prompt.lever]) {
    return LEVER_META[prompt.lever].label;
  }
  const q = prompt.question.trim();
  return q.length > 28 ? `${q.slice(0, 28)}…` : q || "Detail";
}

function truncatePreview(text: string, max = 72): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface ImpactBoosterPanelProps {
  booster: ImpactBoosterState | null | undefined;
  prompts: ImpactBoosterPrompt[];
  isGenerating?: boolean;
  disabled?: boolean;
  collapsible?: boolean;
  showIntroHighlight?: boolean;
  includeInRun: boolean;
  onIncludeInRunChange: (include: boolean) => void;
  draftFields: ImpactBoosterDraftFields;
  onDraftFieldsChange: (fields: ImpactBoosterDraftFields) => void;
  onSave: (next: ImpactBoosterState) => Promise<void> | void;
  onClearAll: () => Promise<void> | void;
  includeLabel?: string;
  /**
   * When both previews are present, Impact Booster splits details by
   * accomplishment so two sentences in one MPA stay distinct.
   */
  sentencePreviews?: { 1: string; 2: string } | null;
  /** Fires when the collapsible opens/closes (used to open split view on 2 sentences). */
  onExpandedChange?: (open: boolean) => void;
}

export function ImpactBoosterPanel({
  booster,
  prompts,
  isGenerating = false,
  disabled = false,
  collapsible = true,
  showIntroHighlight = true,
  includeInRun,
  onIncludeInRunChange,
  draftFields,
  onDraftFieldsChange,
  onSave,
  onClearAll,
  includeLabel = "Include on Generate / Revise",
  sentencePreviews = null,
  onExpandedChange,
}: ImpactBoosterPanelProps) {
  const fieldPrefix = useId();
  const includeId = `${fieldPrefix}-include`;
  const persisted = normalizeImpactBooster(booster ?? {});
  const hasSaved = hasImpactBoosterContent(persisted);
  const dual = !!(sentencePreviews?.["1"] != null && sentencePreviews?.["2"] != null);

  const [open, setOpen] = useState(() => !collapsible);
  const [showNewBadge, setShowNewBadge] = useState(
    () => showIntroHighlight && !hasSeenImpactBoosterIntro()
  );
  const [activeSentence, setActiveSentence] = useState<1 | 2>(1);

  const { draftAnswers, freeform, sentenceNotes } = draftFields;
  const [isSaving, setIsSaving] = useState(false);

  const activePrompts = promptsForSentence(
    prompts,
    dual ? activeSentence : undefined,
    dual
  );

  const hasDraftInput =
    Object.values(draftAnswers).some((v) => v.trim().length > 0) ||
    freeform.trim().length > 0 ||
    sentenceNotes["1"].trim().length > 0 ||
    sentenceNotes["2"].trim().length > 0;

  const dismissNewBadge = () => {
    if (!showNewBadge) return;
    markImpactBoosterIntroSeen();
    setShowNewBadge(false);
  };

  const buildNextState = (
    answersMap: Record<string, string> = draftAnswers,
    notes: string = freeform,
    sNotes: Record<"1" | "2", string> = sentenceNotes
  ): ImpactBoosterState =>
    buildImpactBoosterFromDrafts(persisted, prompts, {
      draftAnswers: answersMap,
      freeform: notes,
      sentenceNotes: sNotes,
    }, dual);

  const publishDraft = (
    answersMap: Record<string, string>,
    notes: string,
    sNotes: Record<"1" | "2", string>
  ) => {
    const fields: ImpactBoosterDraftFields = {
      draftAnswers: answersMap,
      freeform: notes,
      sentenceNotes: sNotes,
    };
    onDraftFieldsChange(fields);
  };

  const handleSave = async () => {
    dismissNewBadge();
    setIsSaving(true);
    try {
      const next = buildNextState();
      await onSave(next);
      onDraftFieldsChange({
        draftAnswers: Object.fromEntries(
          next.answers.map((qa) => [
            impactBoosterDraftKey(qa.question, qa.sentenceNumber),
            qa.answer,
          ])
        ),
        freeform: next.freeform ?? "",
        sentenceNotes: {
          "1": next.sentenceFreeform?.["1"] ?? "",
          "2": next.sentenceFreeform?.["2"] ?? "",
        },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    onExpandedChange?.(nextOpen);
    if (nextOpen) {
      dismissNewBadge();
      publishDraft(draftAnswers, freeform, sentenceNotes);
    }
  };

  const busy = disabled || isGenerating || isSaving;
  const notesId = `${fieldPrefix}-notes`;
  const activeKey = dual ? (String(activeSentence) as "1" | "2") : null;

  const body = (
    <div className="space-y-2 px-3 pb-3 pt-0.5">
      {persisted.summary ? (
        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
          {persisted.summary}
        </p>
      ) : null}

      {dual && sentencePreviews ? (
        <div className="space-y-1.5">
          <div
            className="flex rounded-md border bg-muted/30 p-0.5"
            role="tablist"
            aria-label="Which accomplishment these details apply to"
          >
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={activeSentence === n}
                disabled={busy}
                onClick={() => setActiveSentence(n)}
                className={cn(
                  "flex-1 h-7 px-2 rounded text-[11px] font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                  activeSentence === n
                    ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.08)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Accomplishment {n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
            {truncatePreview(sentencePreviews[activeSentence]) ||
              `Details for accomplishment ${activeSentence} only`}
          </p>
        </div>
      ) : null}

      {activePrompts.map((prompt) => {
        const lever = prompt.lever;
        const meta = lever ? LEVER_META[lever] : null;
        const Icon = meta?.icon;
        const label = shortLabel(prompt);
        const sentenceNumber = dual ? activeSentence : undefined;
        const draftKey = impactBoosterDraftKey(prompt.question, sentenceNumber);
        const fieldId = `${fieldPrefix}-q-${sentenceNumber ?? 0}-${prompt.lever ?? "g"}-${prompt.question.slice(0, 16).replace(/\W+/g, "-")}`;
        return (
          <div key={draftKey} className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor={fieldId}
                  className="flex w-[5.5rem] shrink-0 cursor-help items-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  {Icon ? (
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="truncate">{label}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-[280px] text-xs leading-snug"
              >
                {prompt.question}
                {meta?.hint ? (
                  <span className="mt-1.5 block text-muted-foreground">
                    {meta.hint}
                  </span>
                ) : null}
              </TooltipContent>
            </Tooltip>
            <Input
              id={fieldId}
              value={draftAnswers[draftKey] ?? ""}
              onChange={(e) => {
                const nextAnswers = {
                  ...draftAnswers,
                  [draftKey]: e.target.value,
                };
                publishDraft(nextAnswers, freeform, sentenceNotes);
              }}
              placeholder={meta?.placeholder || "e.g. stewardship detail"}
              title={prompt.hint?.trim() || meta?.hint || prompt.question}
              className="h-8 text-xs"
              disabled={busy}
              aria-label={
                dual
                  ? `${prompt.question} (accomplishment ${activeSentence})`
                  : prompt.question
              }
            />
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <label
          htmlFor={notesId}
          className="w-[5.5rem] shrink-0 text-[11px] font-medium text-muted-foreground"
        >
          Notes
        </label>
        <Input
          id={notesId}
          value={
            dual && activeKey
              ? sentenceNotes[activeKey]
              : freeform
          }
          onChange={(e) => {
            const nextNotes = e.target.value.slice(0, IMPACT_BOOSTER_FREEFORM_MAX);
            if (dual && activeKey) {
              const nextSNotes = { ...sentenceNotes, [activeKey]: nextNotes };
              publishDraft(draftAnswers, freeform, nextSNotes);
            } else {
              publishDraft(draftAnswers, nextNotes, sentenceNotes);
            }
          }}
          placeholder={
            dual
              ? `Notes for accomplishment ${activeSentence} only`
              : "FMC, sortie, inspection, wing/MAJCOM cascade — optional"
          }
          className="h-8 text-xs"
          disabled={busy}
          maxLength={IMPACT_BOOSTER_FREEFORM_MAX}
          aria-label={
            dual
              ? `Notes for accomplishment ${activeSentence}`
              : "Additional Impact Booster notes"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <label
          htmlFor={includeId}
          className={cn(
            "flex items-center gap-1.5 text-[11px] cursor-pointer select-none",
            busy && "opacity-50 pointer-events-none"
          )}
        >
          <input
            id={includeId}
            type="checkbox"
            checked={includeInRun}
            disabled={busy}
            onChange={(e) => {
              dismissNewBadge();
              onIncludeInRunChange(e.target.checked);
            }}
            className="size-3.5 rounded border-input accent-primary"
            aria-label={includeLabel}
          />
          <span className="font-medium text-foreground">{includeLabel}</span>
        </label>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5 active:scale-[0.98] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
            disabled={busy || !hasDraftInput}
            onClick={() => void handleSave()}
          >
            {isSaving ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="size-3.5 mr-1" />
            )}
            Save
          </Button>
          {hasSaved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => void onClearAll()}
                  aria-label="Clear Impact Booster details for this MPA"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear details for this MPA</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {dual
          ? includeInRun
            ? "Each accomplishment’s details stay separate on Generate / Revise (uses a credit)."
            : "Details saved per accomplishment — not sent until you include them."
          : includeInRun
            ? "Details ride along with Generate / Revise (uses a credit)."
            : "Details saved for this MPA only — not sent until you include them."}
      </p>
    </div>
  );

  const headerBits = (
    <>
      <Lightbulb className="size-4 text-primary shrink-0" aria-hidden="true" />
      <span className="text-xs font-semibold tracking-tight shrink-0">Impact Booster</span>
      <span className="text-[11px] text-primary/80 font-medium truncate min-w-0">
        Is your impact missing anything?
      </span>
      {typeof persisted.strength === "number" ? (
        <StrengthChip strength={persisted.strength} />
      ) : null}
      {hasSaved ? (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal shrink-0">
          Saved
        </Badge>
      ) : null}
      {dual ? (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[10px] font-normal shrink-0 hidden sm:inline-flex"
        >
          Per sentence
        </Badge>
      ) : null}
      {includeInRun && (hasSaved || hasDraftInput) ? (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[10px] font-medium text-primary border-primary/30 bg-primary/5 shrink-0"
        >
          Included
        </Badge>
      ) : null}
      {showNewBadge ? (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[10px] font-medium text-primary border-primary/30 bg-primary/5 shrink-0"
        >
          New
        </Badge>
      ) : null}
    </>
  );

  if (!collapsible) {
    return (
      <div
        className="rounded-lg border bg-background space-y-2 p-3"
        data-epb-impact-booster
      >
        <div className="flex flex-wrap items-center gap-2">{headerBits}</div>
        {body}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-background overflow-hidden",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.06)]",
        showNewBadge &&
          "border-primary/40 shadow-[0_1px_2px_color-mix(in_oklab,var(--primary)_10%,transparent),0_0_0_0.5px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
      )}
      data-epb-impact-booster
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${fieldPrefix}-impact-booster-body`}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left",
          "hover:bg-muted/40 active:scale-[0.99] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        {headerBits}
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={`${fieldPrefix}-impact-booster-body`}
        className="t-collapse-grid"
        data-open={open ? "true" : "false"}
      >
        <div>{body}</div>
      </div>
    </div>
  );
}
