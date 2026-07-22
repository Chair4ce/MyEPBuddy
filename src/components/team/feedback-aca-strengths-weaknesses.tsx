"use client";

import { Badge } from "@/components/ui/badge";
import {
  buildCycleAcaStrengthsWeaknesses,
  type AcaStrengthWeaknessItem,
} from "@/lib/feedback-aca-strengths-weaknesses";
import { cn } from "@/lib/utils";
import type { FeedbackEvidenceItem } from "@/app/actions/supervisor-feedbacks";
import type { Rank } from "@/types/database";

function proficiencyBadgeClass(label: string): string {
  if (label === "Does Not Meet") {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
  if (label === "Meets") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  if (label === "Exceeds") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
  }
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

function ItemRow({ item }: { item: AcaStrengthWeaknessItem }) {
  return (
    <li className="rounded-sm px-2 py-1.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50">
      <p className="truncate text-sm leading-snug">{item.summary}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{item.date}</span>
        <span aria-hidden>·</span>
        <span>{item.mpaLabel}</span>
        <Badge
          variant="secondary"
          className={cn(
            "h-5 px-1.5 text-[10px] font-medium",
            proficiencyBadgeClass(item.proficiencyLabel)
          )}
        >
          {item.proficiencyLabel} · {item.overallScore}
        </Badge>
        {item.weakestIndicatorLabel ? (
          <span className="text-muted-foreground/80">
            Thin: {item.weakestIndicatorLabel}
          </span>
        ) : null}
      </div>
    </li>
  );
}

interface FeedbackAcaStrengthsWeaknessesProps {
  items: FeedbackEvidenceItem[];
  rateeRank: Rank | string | null;
  truncated?: boolean;
  isLoading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export function FeedbackAcaStrengthsWeaknesses({
  items,
  rateeRank,
  truncated,
  isLoading,
  error,
  compact = false,
}: FeedbackAcaStrengthsWeaknessesProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Loading cycle assessments…
        </p>
        <div
          className={cn(
            "animate-pulse rounded-md bg-muted/50",
            compact ? "h-14" : "h-24"
          )}
        />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No accomplishments for this cycle yet. Add and assess entries before
        generating a feedback guide.
      </p>
    );
  }

  const summary = buildCycleAcaStrengthsWeaknesses(items, rateeRank);
  const listClass = cn(
    "space-y-0.5 overflow-y-auto overscroll-contain rounded-md border border-border/60 p-1",
    compact ? "max-h-24" : "max-h-40 sm:max-h-48"
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {summary.assessedCount} assessed · {summary.unassessedCount} not
          assessed · {summary.formLabel} bands
        </span>
        {truncated ? (
          <Badge variant="outline" className="text-[10px]">
            Showing 200 most recent
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          Strengths{" "}
          <span className="font-normal text-muted-foreground">
            (Exceeds / Far Exceeds / Significantly Exceeds)
          </span>
        </p>
        {summary.strengths.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            None assessed at Exceeds or above yet.
          </p>
        ) : (
          <ul className={listClass} aria-label="ACA strengths">
            {summary.strengths.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          Weaknesses{" "}
          <span className="font-normal text-muted-foreground">
            (Does Not Meet / Meets)
          </span>
        </p>
        {summary.weaknesses.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            None assessed below Exceeds.
          </p>
        ) : (
          <ul className={listClass} aria-label="ACA weaknesses">
            {summary.weaknesses.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
