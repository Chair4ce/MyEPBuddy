"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AWARD_LEVELS } from "@/lib/constants";
import type { Award, AwardType, AwardLevel } from "@/types/database";
import {
  Medal,
  Award as AwardIcon,
  Trophy,
  Star,
  Sparkles,
} from "lucide-react";

interface AwardBadgesProps {
  awards: Award[];
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  className?: string;
}

// Award type colors
const AWARD_TYPE_COLORS: Record<AwardType, { bg: string; text: string; border: string }> = {
  coin: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-700",
  },
  quarterly: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
  },
  annual: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-700",
  },
  special: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
  },
};

// Level colors for highlighting
const LEVEL_COLORS: Record<AwardLevel, string> = {
  squadron: "text-slate-600 dark:text-slate-400",
  group: "text-blue-600 dark:text-blue-400",
  wing: "text-purple-600 dark:text-purple-400",
  majcom: "text-amber-600 dark:text-amber-400",
  haf: "text-emerald-600 dark:text-emerald-400",
};

function getAwardIcon(type: AwardType, size: "sm" | "md" | "lg") {
  const sizeClass = size === "sm" ? "size-3" : size === "md" ? "size-4" : "size-5";

  switch (type) {
    case "coin":
      return <Medal className={sizeClass} />;
    case "quarterly":
      return <AwardIcon className={sizeClass} />;
    case "annual":
      return <Trophy className={sizeClass} />;
    case "special":
      return <Star className={sizeClass} />;
    default:
      return <Sparkles className={sizeClass} />;
  }
}

function getAwardLabel(award: Award): string {
  if (award.award_type === "coin") {
    return `Coin from ${award.coin_presenter}`;
  }

  const levelLabel = award.award_level
    ? AWARD_LEVELS.find((l) => l.value === award.award_level)?.shortLabel || award.award_level
    : "";

  if (award.award_type === "quarterly") {
    return `${award.quarter} ${award.award_year} ${levelLabel}`;
  }

  if (award.award_type === "annual") {
    return `${award.award_year} Annual ${levelLabel}`;
  }

  if (award.award_type === "special") {
    return award.award_name || "Special Award";
  }

  return "Award";
}

function getAwardDescription(award: Award): string {
  if (award.award_type === "coin") {
    return award.coin_description || `Received on ${award.coin_date}`;
  }

  const categoryLabel = award.award_category
    ? award.award_category.toUpperCase().replace("_", " ")
    : "";
  const levelLabel = award.award_level
    ? AWARD_LEVELS.find((l) => l.value === award.award_level)?.label || award.award_level
    : "";

  if (award.is_team_award) {
    return `Team ${categoryLabel} - Won at ${levelLabel} level`;
  }

  return `${categoryLabel} - Won at ${levelLabel} level`;
}

export function AwardBadges({
  awards,
  maxDisplay = 5,
  size = "sm",
  showCount = true,
  className,
}: AwardBadgesProps) {
  // Sort awards by importance/recency
  const sortedAwards = useMemo(() => {
    return [...awards].sort((a, b) => {
      // Priority: special > annual > quarterly > coin
      const typePriority: Record<AwardType, number> = {
        special: 4,
        annual: 3,
        quarterly: 2,
        coin: 1,
      };

      // Then by level (higher is better)
      const levelPriority: Record<AwardLevel, number> = {
        haf: 5,
        majcom: 4,
        wing: 3,
        group: 2,
        squadron: 1,
      };

      const typeA = typePriority[a.award_type] || 0;
      const typeB = typePriority[b.award_type] || 0;

      if (typeA !== typeB) return typeB - typeA;

      const levelA = a.award_level ? levelPriority[a.award_level] : 0;
      const levelB = b.award_level ? levelPriority[b.award_level] : 0;

      if (levelA !== levelB) return levelB - levelA;

      // Finally by date
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [awards]);

  if (awards.length === 0) return null;

  const displayAwards = sortedAwards.slice(0, maxDisplay);
  const remainingCount = sortedAwards.length - maxDisplay;

  const badgeSize = size === "sm" ? "size-5" : size === "md" ? "size-6" : "size-8";
  const containerGap = size === "sm" ? "-space-x-1" : size === "md" ? "-space-x-1.5" : "-space-x-2";

  return (
    <div className={cn("flex items-center", containerGap, className)}>
      <TooltipProvider>
        {displayAwards.map((award) => {
          const colors = AWARD_TYPE_COLORS[award.award_type];
          const levelColor = award.award_level ? LEVEL_COLORS[award.award_level] : "";

          return (
            <Tooltip key={award.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full border cursor-help transition-transform hover:scale-110 hover:z-10",
                    badgeSize,
                    colors.bg,
                    colors.text,
                    colors.border
                  )}
                >
                  {getAwardIcon(award.award_type, size)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <div className="space-y-1">
                  <p className={cn("font-medium text-xs", levelColor)}>
                    {getAwardLabel(award)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {getAwardDescription(award)}
                  </p>
                  {award.is_team_award && (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                      🏆 Team Award
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {showCount && remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center justify-center rounded-full border cursor-help bg-muted text-muted-foreground border-border text-[9px] font-medium",
                  badgeSize
                )}
              >
                +{remainingCount}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{remainingCount} more award{remainingCount !== 1 ? "s" : ""}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );
}

// Individual award badge for detail views
interface AwardBadgeProps {
  award: Award;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  className?: string;
}

export function AwardBadge({ award, size = "md", showDetails = false, className }: AwardBadgeProps) {
  const colors = AWARD_TYPE_COLORS[award.award_type];
  const levelColor = award.award_level ? LEVEL_COLORS[award.award_level] : "";

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        sizeClasses[size],
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {getAwardIcon(award.award_type, size)}
      <span className={levelColor}>{getAwardLabel(award)}</span>
      {showDetails && award.is_team_award && (
        <span className="text-blue-500">🏆</span>
      )}
    </div>
  );
}

// Summary counts by type
interface AwardSummaryProps {
  awards: Award[];
  className?: string;
}

export function AwardSummary({ awards, className }: AwardSummaryProps) {
  const summary = useMemo(() => {
    const counts: Record<AwardType, number> = {
      coin: 0,
      quarterly: 0,
      annual: 0,
      special: 0,
    };

    awards.forEach((a) => {
      counts[a.award_type]++;
    });

    return counts;
  }, [awards]);

  const types: { type: AwardType; label: string }[] = [
    { type: "coin", label: "Coins" },
    { type: "quarterly", label: "Quarterly" },
    { type: "annual", label: "Annual" },
    { type: "special", label: "Special" },
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {types.map(({ type, label }) => {
        if (summary[type] === 0) return null;
        const colors = AWARD_TYPE_COLORS[type];
        return (
          <div
            key={type}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium",
              colors.bg,
              colors.text,
              colors.border
            )}
          >
            {getAwardIcon(type, "sm")}
            <span>{summary[type]}</span>
            <span className="opacity-70">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

