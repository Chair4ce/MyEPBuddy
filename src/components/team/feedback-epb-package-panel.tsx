"use client";

import { Badge } from "@/components/ui/badge";
import { ENTRY_MGAS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { FeedbackEpbStatementItem } from "@/app/actions/supervisor-feedbacks";

function mpaLabel(mpa: string): string {
  return ENTRY_MGAS.find((m) => m.key === mpa)?.label || mpa;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

interface FeedbackEpbPackagePanelProps {
  items: FeedbackEpbStatementItem[];
  isLoading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export function FeedbackEpbPackagePanel({
  items,
  isLoading,
  error,
  compact = false,
}: FeedbackEpbPackagePanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Loading EPB package…</p>
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
        No EPB statements for this cycle yet. Write the EPB in Generate before
        creating the Final feedback guide.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {items.length} MPA statement{items.length === 1 ? "" : "s"} · primary
          source for Final Generate
        </span>
      </div>
      <ul
        className={cn(
          "space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border/60 p-1",
          compact ? "max-h-36" : "max-h-48 sm:max-h-56"
        )}
        aria-label="EPB package for this cycle"
      >
        {items.map((item) => (
          <li
            key={item.mpa}
            className="rounded-sm px-2 py-1.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50"
          >
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {mpaLabel(item.mpa)}
              </Badge>
            </div>
            <p className="text-sm leading-snug text-foreground/90">
              {truncate(item.text, compact ? 160 : 220)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
