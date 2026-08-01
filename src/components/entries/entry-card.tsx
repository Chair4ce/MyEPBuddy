"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, UserCheck } from "lucide-react";
import { AssessmentDetailDialog } from "@/components/entries/assessment-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isAssessmentStale } from "@/lib/assessment-coaching";
import {
  STEWARDSHIP_LABELS,
  hasStewardshipImpactContent,
  normalizeStewardshipImpact,
} from "@/lib/stewardship-impact";
import { formatShortDate, formatShortDateWithYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Accomplishment } from "@/types/database";

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-600 bg-green-500/10";
  if (score >= 60) return "text-blue-600 bg-blue-500/10";
  if (score >= 40) return "text-amber-600 bg-amber-500/10";
  return "text-muted-foreground bg-muted";
}

type CreatorProfile = {
  full_name: string | null;
  rank: string | null;
};

type EntryCardProps = {
  entry: Accomplishment;
  mpaLabel: string;
  /** list = full content; compact = quarterly nested row */
  variant?: "list" | "compact";
  showSelect?: boolean;
  isSelected?: boolean;
  showScore?: boolean;
  creator?: CreatorProfile;
  onToggleSelect?: (checked: boolean) => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCardClick?: (e: React.MouseEvent) => void;
};

export function EntryCard({
  entry,
  mpaLabel,
  variant = "list",
  showSelect = false,
  isSelected = false,
  showScore = false,
  creator,
  onToggleSelect,
  onEdit,
  onRequestDelete,
  onCardClick,
}: EntryCardProps) {
  const isCompact = variant === "compact";
  const assessmentScores = entry.assessment_scores;
  const hasScore = assessmentScores?.overall_score != null;
  const overallScore = assessmentScores?.overall_score ?? 0;
  const assessmentStale = isAssessmentStale(
    entry.assessed_at,
    entry.updated_at
  );
  const showCreator =
    !!entry.created_by &&
    entry.created_by !== entry.user_id &&
    !!creator;
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:bg-muted/40",
        isCompact ? "p-3.5" : "p-4 sm:p-5",
        isSelected && "ring-1 ring-primary/40 bg-primary/5",
        showSelect && "cursor-pointer"
      )}
      onClick={onCardClick}
    >
      <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {showSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onToggleSelect?.(checked === true)}
                aria-label={`Select entry from ${formatShortDate(entry.date)}`}
                className="shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p
                  className={cn(
                    "font-semibold tracking-tight text-foreground",
                    isCompact ? "text-sm" : "text-base"
                  )}
                >
                  {mpaLabel}
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {isCompact
                    ? formatShortDate(entry.date)
                    : formatShortDateWithYear(entry.date)}
                </span>
                {showCreator && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCheck className="size-3" />
                          {creator.rank}
                          {!isCompact && creator.full_name
                            ? ` ${creator.full_name.split(" ")[0]}`
                            : ""}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Entry created by {creator.rank} {creator.full_name}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <p
                className={cn(
                  "mt-2 text-foreground leading-relaxed",
                  isCompact
                    ? "text-sm line-clamp-3"
                    : "text-base sm:text-[1.05rem]"
                )}
              >
                {entry.details}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {showScore &&
                (hasScore ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "relative flex items-center justify-center rounded-md font-semibold tabular-nums",
                            "cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            "hover:brightness-95 active:scale-[0.98]",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isCompact
                              ? "min-w-11 px-2 py-1 text-lg"
                              : "min-w-14 px-2.5 py-1.5 text-2xl",
                            getScoreColor(overallScore),
                            assessmentStale &&
                              "ring-1 ring-amber-500/50"
                          )}
                          aria-label={
                            assessmentStale
                              ? `View assessment details, score ${overallScore} out of 100. Assessment is outdated.`
                              : `View assessment details, score ${overallScore} out of 100`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssessmentOpen(true);
                          }}
                        >
                          {overallScore}
                          {assessmentStale && (
                            <span
                              aria-hidden
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 shadow-[0_0_0_1.5px_var(--color-card)]"
                            />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="font-medium">
                          {assessmentStale
                            ? "Assessment outdated"
                            : "View assessment"}
                        </p>
                        {assessmentStale && (
                          <p className="text-xs text-muted-foreground">
                            Entry changed after this score — re-assess to refresh.
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-md border border-dashed text-muted-foreground/50",
                      isCompact
                        ? "min-w-11 px-2 py-1 text-sm"
                        : "min-w-14 px-2.5 py-1.5 text-base"
                    )}
                    aria-label="No quality score yet"
                  >
                    —
                  </div>
                ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 text-muted-foreground",
                      "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                      "data-[state=open]:opacity-100",
                      "transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      "active:scale-[0.98]"
                    )}
                    aria-label="Entry actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={onEdit}
                    className="gap-2"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={onRequestDelete}
                    className="gap-2"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {!isCompact && (
            <EntryCardExtras entry={entry} />
          )}
      </div>

      {assessmentScores && (
        <AssessmentDetailDialog
          open={assessmentOpen}
          onOpenChange={setAssessmentOpen}
          accomplishmentId={entry.id}
          scores={assessmentScores}
          selectedMpa={entry.mpa}
          assessedAt={entry.assessed_at}
          updatedAt={entry.updated_at}
        />
      )}
    </div>
  );
}

function EntryCardExtras({ entry }: { entry: Accomplishment }) {
  const stewardship = normalizeStewardshipImpact(entry.stewardship_impact);
  const hasStewardship = hasStewardshipImpactContent(stewardship);
  const hasImpact = hasStewardship || !!entry.impact;
  const hasMetrics = !!entry.metrics;
  const hasTags = Array.isArray(entry.tags) && entry.tags.length > 0;

  if (!hasImpact && !hasMetrics && !hasTags) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {hasStewardship && (
        <div className="space-y-1">
          {(
            [
              ["time", stewardship.time],
              ["money", stewardship.money],
              ["resources", stewardship.resources],
              ["outcome", stewardship.outcome],
            ] as const
          )
            .filter(([, value]) => !!value)
            .map(([key, value]) => (
              <p key={key} className="text-sm text-muted-foreground leading-snug">
                <span className="font-medium text-foreground/70">
                  {STEWARDSHIP_LABELS[key]}
                </span>
                {" · "}
                {value}
              </p>
            ))}
        </div>
      )}
      {!hasStewardship && entry.impact && (
        <p className="text-sm text-muted-foreground leading-snug">
          {entry.impact}
        </p>
      )}
      {hasMetrics && (
        <p className="text-sm text-muted-foreground leading-snug">
          {entry.metrics}
        </p>
      )}
      {hasTags && (
        <div className="flex gap-1.5 flex-wrap pt-0.5">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
