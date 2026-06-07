"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCreditsStore } from "@/stores/credits-store";
import { Sparkles } from "lucide-react";

interface UsageIndicatorProps {
  isCollapsed: boolean;
}

export function UsageIndicator({ isCollapsed }: UsageIndicatorProps) {
  const { balance, hasOwnKey, trialCredits, isLoading } = useCreditsStore();

  if (hasOwnKey || isLoading || balance === null) return null;

  const totalAvailable = trialCredits + (balance > trialCredits ? balance - trialCredits : 0);
  const maxDisplay = Math.max(trialCredits, balance, totalAvailable);
  const used = Math.max(0, maxDisplay - balance);
  const pct = maxDisplay > 0 ? Math.round((used / maxDisplay) * 100) : 100;
  const isWarning = balance <= 20 && balance > 5;
  const isCritical = balance <= 5;

  const barColor = isCritical
    ? "[&>[data-slot=progress-indicator]]:bg-red-500"
    : isWarning
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-emerald-500";

  const label = `${balance} token${balance !== 1 ? "s" : ""} left`;

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings/billing"
            className={cn(
              "flex items-center justify-center h-10 w-10 mx-auto rounded-md",
              "text-muted-foreground hover:bg-sidebar-accent/50 transition-colors",
              isCritical && "text-red-500",
              isWarning && "text-amber-500",
            )}
            aria-label={label}
          >
            <Sparkles className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Monitor usage or get more tokens
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href="/settings/billing"
      className="block px-4 py-2.5 mx-3 rounded-md hover:bg-sidebar-accent/50 transition-colors group"
      aria-label={label}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          Tokens
        </span>
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            isCritical
              ? "text-red-500"
              : isWarning
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        >
          {balance} left
        </span>
      </div>
      <Progress
        value={100 - pct}
        className={cn("h-1.5 bg-muted", barColor)}
        aria-label={label}
      />
    </Link>
  );
}
