"use client";

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  trackerEntryProgress,
  type TokenRewardTrackerEntry,
} from "@/lib/billing/reward-constants";
import { getEarnRewardActionLink } from "@/lib/billing/earn-reward-links";
import { ChevronRight, Clock } from "lucide-react";

function repeatBadge(entry: TokenRewardTrackerEntry) {
  if (
    entry.repeat_mode === "once_per_user" ||
    entry.repeat_mode === "once_per_source"
  ) {
    return (
      <Badge variant="secondary" className="font-normal pointer-events-none">
        One-time
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal pointer-events-none">
      Repeatable
    </Badge>
  );
}

function progressLabel(entry: TokenRewardTrackerEntry): string {
  const { count, cap, complete } = trackerEntryProgress(entry);
  if (
    entry.repeat_mode === "once_per_user" ||
    entry.repeat_mode === "once_per_source"
  ) {
    return complete ? "Claimed" : "Not yet";
  }
  if (cap === null) return `${count} this year`;
  return `${count} / ${cap} this year`;
}

interface EarnRewardTrackerEntryRowProps {
  entry: TokenRewardTrackerEntry;
  className?: string;
}

export function EarnRewardTrackerEntryRow({
  entry,
  className,
}: EarnRewardTrackerEntryRowProps) {
  const { percent, complete } = trackerEntryProgress(entry);
  const actionLink = getEarnRewardActionLink(entry.reward_key);

  const inner = (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              actionLink && "group-hover:text-primary transition-colors",
            )}
          >
            {entry.public_label}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {repeatBadge(entry)}
            {!entry.enabled && (
              <Badge
                variant="secondary"
                className="font-normal gap-1 text-muted-foreground pointer-events-none"
              >
                <Clock className="size-3" aria-hidden />
                Coming soon
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {entry.rule_summary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5 tabular-nums">
          <div className="text-right">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              +{entry.amount}
            </p>
            <p className="text-xs text-muted-foreground">{progressLabel(entry)}</p>
          </div>
          {actionLink && (
            <ChevronRight
              className="size-4 text-muted-foreground group-hover:text-primary transition-colors"
              aria-hidden
            />
          )}
        </div>
      </div>
      <Progress
        value={percent}
        className={cn(
          "h-1.5",
          complete && "[&>[data-slot=progress-indicator]]:bg-emerald-500",
        )}
        aria-label={`${entry.public_label} progress ${progressLabel(entry)}`}
      />
    </div>
  );

  if (!actionLink) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-card p-4",
          className,
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={actionLink.href}
      className={cn(
        "group block rounded-lg border bg-card p-4 transition-colors",
        "hover:border-primary/40 hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
      aria-label={actionLink.ariaLabel}
    >
      {inner}
    </Link>
  );
}
