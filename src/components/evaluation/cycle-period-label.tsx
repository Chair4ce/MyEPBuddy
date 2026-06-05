"use client";

import { getActiveCyclePeriod, getCyclePeriodForYear } from "@/lib/constants";
import type { Rank } from "@/types/database";
import { cn } from "@/lib/utils";

interface CyclePeriodLabelProps {
  rank: Rank | null | undefined;
  /** When set, shows the period for this SCOD year (e.g. open EPB shell) instead of today's active cycle. */
  cycleYear?: number;
  className?: string;
  fallback?: string;
}

export function CyclePeriodLabel({
  rank,
  cycleYear,
  className,
  fallback = "—",
}: CyclePeriodLabelProps) {
  const period =
    cycleYear !== undefined
      ? getCyclePeriodForYear(rank ?? null, cycleYear)
      : getActiveCyclePeriod(rank ?? null);

  if (!period) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <span
      className={cn("tabular-nums", className)}
      title={`SCOD: ${period.closeoutLabel}`}
    >
      {period.rangeLabel}
    </span>
  );
}
