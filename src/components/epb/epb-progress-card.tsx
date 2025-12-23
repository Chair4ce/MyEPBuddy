"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getStaticCloseoutDate,
  getDaysUntilCloseout,
  getCycleProgress,
  getEPBMilestones,
  ENTRY_MGAS,
  MPA_ABBREVIATIONS,
  RANK_TO_TIER,
} from "@/lib/constants";
import type { Rank, Accomplishment } from "@/types/database";
import {
  Clock,
  CheckCircle2,
  Circle,
  TrendingUp,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EPBProgressCardProps {
  rank: Rank | null;
  entries: Accomplishment[];
  statements?: { mpa: string }[];
  className?: string;
  compact?: boolean;
  title?: string;
}

// Recommended minimum entries per MPA for a complete EPB
const RECOMMENDED_ENTRIES_PER_MPA = 3;
const RECOMMENDED_STATEMENTS_PER_MPA = 2;

export function EPBProgressCard({
  rank,
  entries,
  statements = [],
  className,
  compact = false,
  title = "Performance Coverage & Progress",
}: EPBProgressCardProps) {
  const tier = rank ? RANK_TO_TIER[rank] : null;
  const closeout = getStaticCloseoutDate(rank);
  const daysUntil = getDaysUntilCloseout(rank);
  const cycleProgress = getCycleProgress(rank);
  const milestones = getEPBMilestones(rank);

  // Calculate MPA coverage
  const mpaStats = useMemo(() => {
    const stats: Record<string, { entries: number; statements: number }> = {};
    
    ENTRY_MGAS.forEach((mpa) => {
      stats[mpa.key] = { entries: 0, statements: 0 };
    });

    entries.forEach((entry) => {
      if (stats[entry.mpa]) {
        stats[entry.mpa].entries++;
      }
    });

    statements.forEach((stmt) => {
      if (stats[stmt.mpa]) {
        stats[stmt.mpa].statements++;
      }
    });

    return stats;
  }, [entries, statements]);

  // Calculate overall readiness
  const readiness = useMemo(() => {
    let totalEntries = 0;
    let coveredMPAs = 0;
    let wellCoveredMPAs = 0;

    Object.values(mpaStats).forEach((stat) => {
      totalEntries += stat.entries;
      if (stat.entries > 0) coveredMPAs++;
      if (stat.entries >= RECOMMENDED_ENTRIES_PER_MPA) wellCoveredMPAs++;
    });

    const mpaCount = ENTRY_MGAS.length;
    const totalEntriesNeeded = mpaCount * RECOMMENDED_ENTRIES_PER_MPA;
    const coveragePercent = (coveredMPAs / mpaCount) * 100;
    // Overall progress: how many entries you have vs how many you need total
    const overallProgress = Math.min(100, (totalEntries / totalEntriesNeeded) * 100);

    return {
      totalEntries,
      totalEntriesNeeded,
      coveredMPAs,
      wellCoveredMPAs,
      mpaCount,
      coveragePercent,
      overallProgress,
    };
  }, [mpaStats]);


  // Civilians don't have EPBs - return null to not show anything
  if (rank === "Civilian") {
    return null;
  }

  // AB and Amn don't have EPBs
  if (rank && (rank === "AB" || rank === "Amn")) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>EPB tracking begins at SrA.</p>
            <p className="mt-1">Keep logging entries—they&apos;ll count toward your first EPB!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rank || !tier || !closeout) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            Set your rank in Profile Settings to see EPB progress.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Find next milestone
  const nextMilestone = milestones?.find((m) => !m.isPast);

  if (compact) {
    return (
      <Card className={cn("border", className)}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4">
            {/* Countdown */}
            <div className="flex items-center gap-2 text-foreground">
              <Clock className="size-4" />
              <span className="font-medium">
                {daysUntil !== null ? `${daysUntil}d` : "—"} to close-out
              </span>
            </div>

            {/* MPA Coverage */}
            <div className="flex items-center gap-1.5">
              <TooltipProvider delayDuration={200}>
                {ENTRY_MGAS.map((mpa) => {
                  const stat = mpaStats[mpa.key];
                  const hasEntries = stat.entries > 0;
                  const isComplete = stat.entries >= RECOMMENDED_ENTRIES_PER_MPA;
                  
                  return (
                    <Tooltip key={mpa.key}>
                      <TooltipTrigger>
                        <div
                          className={cn(
                            "size-6 rounded text-[10px] font-bold flex items-center justify-center transition-colors",
                            isComplete
                              ? "bg-primary text-primary-foreground"
                              : hasEntries
                              ? "bg-primary/50 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {MPA_ABBREVIATIONS[mpa.key]}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{mpa.label}</p>
                        <p className="text-xs">
                          {stat.entries} entries
                          {stat.entries < RECOMMENDED_ENTRIES_PER_MPA && 
                            ` (need ${RECOMMENDED_ENTRIES_PER_MPA - stat.entries} more)`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {readiness.totalEntries} entries
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {Math.round(readiness.coveragePercent)}% covered
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="size-4" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Clock className="size-4" />
            {daysUntil !== null ? (
              daysUntil === 0 ? "Today!" :
              daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` :
              `${daysUntil} days`
            ) : "—"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timeline Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cycle Progress</span>
            <span className="font-medium">{Math.round(cycleProgress || 0)}%</span>
          </div>
          <Progress value={cycleProgress || 0} className="h-2" />
        </div>

        {/* Next Milestone */}
        {nextMilestone && (
          <div className="rounded-lg p-3 text-sm bg-muted/50">
            <div className="flex items-start gap-2">
              <TrendingUp className="size-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">
                  {nextMilestone.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {nextMilestone.daysFromNow === 0 
                    ? "Today" 
                    : nextMilestone.daysFromNow === 1 
                    ? "Tomorrow"
                    : `In ${nextMilestone.daysFromNow} days`} — {nextMilestone.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MPA Coverage Grid */}
        <div className="space-y-2">
          <p className="text-sm font-medium">MPA Coverage</p>
          <div className="grid grid-cols-2 gap-2">
            <TooltipProvider delayDuration={200}>
              {ENTRY_MGAS.map((mpa) => {
                const stat = mpaStats[mpa.key];
                const progress = Math.min(100, (stat.entries / RECOMMENDED_ENTRIES_PER_MPA) * 100);
                const isComplete = stat.entries >= RECOMMENDED_ENTRIES_PER_MPA;
                
                return (
                  <Tooltip key={mpa.key}>
                    <TooltipTrigger asChild>
                      <div className="p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-help">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium truncate pr-2">
                            {MPA_ABBREVIATIONS[mpa.key]}
                          </span>
                          <div className="flex items-center gap-1">
                            {isComplete ? (
                              <CheckCircle2 className="size-3.5 text-primary" />
                            ) : stat.entries > 0 ? (
                              <Circle className="size-3.5 text-primary/50 fill-primary/20" />
                            ) : (
                              <Circle className="size-3.5 text-muted-foreground" />
                            )}
                            <span className="text-[10px] tabular-nums">
                              {stat.entries}/{RECOMMENDED_ENTRIES_PER_MPA}
                            </span>
                          </div>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{mpa.label}</p>
                      <p className="text-xs">
                        {stat.entries} of {RECOMMENDED_ENTRIES_PER_MPA} recommended entries
                      </p>
                      {stat.entries < RECOMMENDED_ENTRIES_PER_MPA && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Add {RECOMMENDED_ENTRIES_PER_MPA - stat.entries} more for complete coverage
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between text-xs pt-2 border-t">
          <span className="text-muted-foreground">
            {readiness.totalEntries} total entries • {readiness.coveredMPAs}/{readiness.mpaCount} MPAs covered
          </span>
          <Badge variant={readiness.overallProgress === 100 ? "default" : "secondary"} className="text-[10px]">
            {readiness.overallProgress === 100 ? "Ready!" : `${Math.round(readiness.overallProgress)}% progress`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// Mini version for supervisor tree nodes
interface EPBProgressBadgeProps {
  rank: Rank | null;
  entries: Accomplishment[];
  className?: string;
}

export function EPBProgressBadge({ rank, entries, className }: EPBProgressBadgeProps) {
  const daysUntil = getDaysUntilCloseout(rank);
  const tier = rank ? RANK_TO_TIER[rank] : null;

  // Civilians, AB, and Amn don't have EPBs
  if (!tier || rank === "AB" || rank === "Amn" || rank === "Civilian") return null;

  // Calculate coverage
  const coveredMPAs = new Set(entries.map((e) => e.mpa)).size;
  const totalMPAs = ENTRY_MGAS.length;
  const coveragePercent = (coveredMPAs / totalMPAs) * 100;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground",
              className
            )}
          >
            <Clock className="size-3" />
            <span>{daysUntil}d</span>
            <span className="opacity-70">•</span>
            <span>{Math.round(coveragePercent)}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{daysUntil} days to EPB close-out</p>
          <p className="text-xs">{coveredMPAs}/{totalMPAs} MPAs covered • {entries.length} entries</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

