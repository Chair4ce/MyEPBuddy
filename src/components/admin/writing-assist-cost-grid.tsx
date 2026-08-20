"use client";

import { cn } from "@/lib/utils";
import { motionProgressIndicator } from "@/lib/motion/classes";
import type { ActionCostPoint } from "@/lib/admin/usage-chart-data";
import { formatCost, formatInt } from "@/lib/admin/usage-formatters";

export function WritingAssistCostGrid({
  points,
}: {
  points: ActionCostPoint[];
}) {
  const featured = points.filter((row) => row.featured);
  const maxCost = Math.max(...featured.map((row) => row.cost), 0);

  return (
    <ul
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Writing assist estimated cost"
    >
      {featured.map((row) => {
        const share = maxCost > 0 ? row.cost / maxCost : 0;
        return (
          <li
            key={row.action}
            className="rounded-lg border border-border/80 bg-muted/20 p-3"
          >
            <p className="text-sm font-medium">{row.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
              {formatCost(row.cost)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatInt(row.calls)} {row.calls === 1 ? "call" : "calls"}
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <div
                className={cn(
                  "h-full w-full origin-left rounded-full bg-chart-1",
                  motionProgressIndicator,
                )}
                style={{ transform: `scaleX(${share})` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
