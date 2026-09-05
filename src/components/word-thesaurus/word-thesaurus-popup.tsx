"use client";

import { BookA, Loader2, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  motionChip,
  motionCollapseGrid,
  motionEnter,
  motionEnterDurFast,
  motionInputFocus,
  motionPressable,
  motionSurfaceElevated,
  motionTransitionColors,
} from "@/lib/motion/classes";
import type { WordThesaurusApi } from "@/hooks/use-word-thesaurus";

interface WordThesaurusPopupProps {
  thesaurus: WordThesaurusApi;
}

function ReplacementChip({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(label)}
      className={cn(
        "px-2 py-1 rounded-md text-xs border border-border/80 bg-background",
        "hover:bg-accent hover:border-primary/40",
        motionChip,
      )}
      aria-label={`Replace with ${label}`}
    >
      {label}
    </button>
  );
}

export function WordThesaurusPopup({ thesaurus }: WordThesaurusPopupProps) {
  const {
    open,
    selectedText,
    isSingleWord,
    suggested,
    allSynonyms,
    showAllSynonyms,
    isLoadingSuggestions,
    isLoadingAll,
    revisionResults,
    revisionAnchorText,
    clarifyingQuestions,
    questionAnswers,
    rephraseIntent,
    isRevising,
    enablePhraseRevise,
    applyReplacement,
    applyRevision,
    showAll,
    hideAll,
    reviseSelection,
    setRephraseIntent,
    setQuestionAnswerAt,
    close,
  } = thesaurus;

  const loading = isLoadingSuggestions || isLoadingAll || isRevising;
  const panelOpen = open || revisionResults.length > 0;
  const preview =
    selectedText.length > 48 ? `${selectedText.slice(0, 48)}…` : selectedText;

  return (
    <div
      className={cn("selection-popup", motionCollapseGrid)}
      data-open={panelOpen ? "true" : "false"}
      data-loading={loading ? "true" : "false"}
    >
      <div className="overflow-hidden">
        <div
          role={panelOpen ? "dialog" : undefined}
          aria-hidden={!panelOpen}
          aria-label={
            isSingleWord
              ? `Replacement suggestions for ${selectedText}`
              : `Revise selected text`
          }
          className={cn(
            "mt-2 p-3 rounded-lg bg-card",
            motionSurfaceElevated,
            motionEnter,
            motionEnterDurFast,
          )}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground min-w-0">
                Selected:{" "}
                <span className="font-medium text-foreground">
                  &ldquo;{preview}&rdquo;
                </span>
                <span className="ml-1 tabular-nums">({selectedText.length} chars)</span>
                {isSingleWord && (
                  <span className="ml-1.5 text-[10px] text-primary">word</span>
                )}
              </p>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={close}
                className={cn(
                  "text-muted-foreground hover:text-foreground shrink-0",
                  motionPressable,
                  motionTransitionColors,
                )}
                aria-label="Close replacement suggestions"
              >
                <X className="size-4" />
              </button>
            </div>

            {isSingleWord && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <BookA className="size-3.5 text-primary" />
                  Suggested replacements
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Matched to this sentence, not a raw synonym dump.
                </p>

                {isLoadingSuggestions ? (
                  <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    <Loader2 className="size-3 animate-spin" />
                    Finding replacements from this sentence…
                  </div>
                ) : suggested.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggested.map((word) => (
                      <ReplacementChip
                        key={`suggested-${word}`}
                        label={word}
                        onSelect={applyReplacement}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No context-aware replacements yet. Open all synonyms for dictionary matches.
                  </p>
                )}

                <div>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={showAllSynonyms ? hideAll : () => void showAll()}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-xs border border-input bg-background",
                      "hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5",
                      motionChip,
                    )}
                    aria-expanded={showAllSynonyms}
                  >
                    {showAllSynonyms ? "Hide all synonyms" : "See all synonyms"}
                  </button>
                </div>

                <div
                  className={motionCollapseGrid}
                  data-open={showAllSynonyms ? "true" : "false"}
                >
                  <div className="overflow-hidden">
                    <div className="pt-2 space-y-2 border-t border-border/60">
                      <p className="text-[11px] text-muted-foreground">
                        Dictionary synonyms — may not fit this sentence.
                      </p>
                      {isLoadingAll ? (
                        <div
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                          aria-live="polite"
                        >
                          <Loader2 className="size-3 animate-spin" />
                          Loading all synonyms…
                        </div>
                      ) : allSynonyms.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                          {allSynonyms.map((word) => (
                            <ReplacementChip
                              key={`all-${word}`}
                              label={word}
                              onSelect={applyReplacement}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No additional synonyms found.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isSingleWord && enablePhraseRevise && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="rephrase-intent" className="text-[11px] text-muted-foreground">
                    What should this phrase emphasize? (optional)
                  </Label>
                  <Input
                    id="rephrase-intent"
                    value={rephraseIntent}
                    onChange={(event) => setRephraseIntent(event.target.value)}
                    placeholder="e.g. allocating radios, not process improvement"
                    maxLength={240}
                    className={cn("mt-1 h-8 text-xs", motionInputFocus)}
                    aria-label="Optional rephrase intent"
                    autoComplete="off"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <PhraseButton
                    label="Expand"
                    icon={Maximize2}
                    disabled={isRevising}
                    onClick={() => void reviseSelection("expand")}
                  />
                  <PhraseButton
                    label="Compress"
                    icon={Minimize2}
                    disabled={isRevising}
                    onClick={() => void reviseSelection("compress")}
                  />
                  <PhraseButton
                    label="Rephrase"
                    icon={RefreshCw}
                    disabled={isRevising}
                    onClick={() => void reviseSelection("general")}
                  />
                </div>
                {isRevising && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Revising selection…
                  </div>
                )}
              </div>
            )}

            {revisionResults.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Alternatives
                  {revisionAnchorText ? (
                    <span className="font-normal">
                      {" "}
                      for &ldquo;
                      {revisionAnchorText.length > 40
                        ? `${revisionAnchorText.slice(0, 40)}…`
                        : revisionAnchorText}
                      &rdquo;
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Stays until you dismiss or rephrase a new highlight.
                </p>
                {revisionResults.map((revision) => {
                  const baseline = revisionAnchorText || selectedText;
                  return (
                    <button
                      type="button"
                      key={`rev-${revision.slice(0, 48)}-${revision.length}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRevision(revision)}
                      className={cn(
                        "w-full text-left p-2 rounded-md text-sm border border-border/80",
                        "hover:bg-accent hover:border-primary/40",
                        motionChip,
                      )}
                    >
                      <p className="whitespace-pre-wrap">{revision}</p>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {revision.length} chars (
                        {revision.length > baseline.length ? "+" : ""}
                        {revision.length - baseline.length})
                      </span>
                    </button>
                  );
                })}
                <div
                  className={motionCollapseGrid}
                  data-open={clarifyingQuestions.length > 0 ? "true" : "false"}
                >
                  <div className="overflow-hidden">
                    {clarifyingQuestions.length > 0 && (
                      <fieldset className="pt-2 space-y-2 border-t border-border/60">
                        <legend className="text-xs font-medium text-foreground">
                          Sharpen the rewrite
                        </legend>
                        <p className="text-[11px] text-muted-foreground">
                          This phrase is light on facts. Answer any of these, then rephrase again — we will not invent the details for you.
                        </p>
                        {clarifyingQuestions.map((question, index) => {
                          const fieldId = `rephrase-q-${index}`;
                          return (
                            <div key={question} className="space-y-1">
                              <Label htmlFor={fieldId} className="text-[11px] leading-snug text-muted-foreground">
                                {question}
                              </Label>
                              <Input
                                id={fieldId}
                                value={questionAnswers[index] ?? ""}
                                onChange={(event) =>
                                  setQuestionAnswerAt(index, event.target.value)
                                }
                                className={cn("h-8 text-xs", motionInputFocus)}
                                maxLength={160}
                                autoComplete="off"
                              />
                            </div>
                          );
                        })}
                        <PhraseButton
                          label="Rephrase with answers"
                          icon={RefreshCw}
                          disabled={
                            isRevising ||
                            !questionAnswers.some((answer) => answer.trim().length > 0)
                          }
                          onClick={() => void reviseSelection("general")}
                        />
                      </fieldset>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhraseButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Maximize2;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background",
        "hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5",
        "disabled:opacity-50",
        motionChip,
      )}
      aria-label={`${label} selected text`}
    >
      {disabled ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
      {label}
      <TokenCostBadge compact className="ml-0.5" />
    </button>
  );
}
