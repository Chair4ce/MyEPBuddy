"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const { balance, hasOwnKey, trialCredits, isLoading } = useCreditsStore();
  const isActive = pathname === "/settings/billing";

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
              "flex items-center justify-center h-10 w-10 mx-auto rounded-md transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50",
              !isActive && isCritical && "text-red-500",
              !isActive && isWarning && "text-amber-500",
            )}
            aria-label={label}
            data-tour="nav-settings-billing"
          >
            <Sparkles className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Monitor usage or get more tokens
          </p>
          <Link
            href="/settings/billing#earn-tokens"
            className="text-xs text-primary underline underline-offset-2 mt-1 inline-block"
          >
            Earn free tokens
          </Link>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        "px-4 py-2.5 mx-3 rounded-md transition-colors group",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50",
      )}
      data-tour="nav-settings-billing"
    >
      <div className="flex items-center justify-between mb-1.5">
        <Link
          href="/settings/billing"
          className={cn(
            "text-xs font-medium transition-colors",
            isActive
              ? "text-sidebar-accent-foreground"
              : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          Tokens
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/billing#earn-tokens"
            className="text-[10px] text-primary underline underline-offset-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            Earn
          </Link>
          <Link
            href="/settings/billing"
            className={cn(
              "text-xs tabular-nums font-medium",
              isCritical
                ? "text-red-500"
                : isWarning
                  ? "text-amber-500"
                  : isActive
                    ? "text-sidebar-accent-foreground"
                    : "text-muted-foreground",
            )}
            aria-label={label}
          >
            {balance} left
          </Link>
        </div>
      </div>
      <Link href="/settings/billing" aria-hidden tabIndex={-1}>
        <Progress
          value={100 - pct}
          className={cn("h-1.5 bg-muted", barColor)}
          aria-label={label}
        />
      </Link>
    </div>
  );
}
