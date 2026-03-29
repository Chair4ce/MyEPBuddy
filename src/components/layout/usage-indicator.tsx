"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap } from "lucide-react";

interface UsageStats {
  weeklyUsed: number;
  weeklyLimit: number;
  remainingThisWeek: number;
  resetDate: string;
  hasOwnKey: boolean;
}

interface UsageIndicatorProps {
  isCollapsed: boolean;
}

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function UsageIndicator({ isCollapsed }: UsageIndicatorProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const hasOwnKeyRef = useRef(false);

  const fetchStats = useCallback(async () => {
    if (hasOwnKeyRef.current) return;
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const data: UsageStats = await res.json();
        setStats(data);
        hasOwnKeyRef.current = data.hasOwnKey;
      }
    } catch {
      // Silent fail — indicator is non-critical
    }
  }, []);

  useEffect(() => {
    fetchStats();

    const interval = setInterval(fetchStats, POLL_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !hasOwnKeyRef.current) {
        fetchStats();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchStats]);

  if (!stats || stats.hasOwnKey) return null;

  const pct = Math.round((stats.weeklyUsed / stats.weeklyLimit) * 100);
  const isWarning = pct >= 60 && pct < 90;
  const isCritical = pct >= 90;

  const barColor = isCritical
    ? "[&>[data-slot=progress-indicator]]:bg-red-500"
    : isWarning
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-emerald-500";

  const label = `${stats.remainingThisWeek} free AI action${stats.remainingThisWeek !== 1 ? "s" : ""} left`;

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings/api-keys"
            className={cn(
              "flex items-center justify-center h-10 w-10 mx-auto rounded-md",
              "text-muted-foreground hover:bg-sidebar-accent/50 transition-colors",
              isCritical && "text-red-500",
              isWarning && "text-amber-500"
            )}
            aria-label={label}
          >
            <Zap className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {stats.weeklyUsed}/{stats.weeklyLimit} used · Add your own key for
            unlimited
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href="/settings/api-keys"
      className="block px-4 py-2.5 mx-3 rounded-md hover:bg-sidebar-accent/50 transition-colors group"
      aria-label={label}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          Free AI Actions
        </span>
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            isCritical
              ? "text-red-500"
              : isWarning
                ? "text-amber-500"
                : "text-muted-foreground"
          )}
        >
          {stats.weeklyUsed}/{stats.weeklyLimit}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn("h-1.5 bg-muted", barColor)}
        aria-label={label}
      />
    </Link>
  );
}
