"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWillChargeToken } from "@/hooks/use-will-charge-token";

interface TokenCostBadgeProps {
  /** Number of tokens this action consumes. Defaults to 1. */
  cost?: number;
  /** Show only the icon + number (no "token" word). Good inside compact buttons. */
  compact?: boolean;
  className?: string;
}

/**
 * Inline indicator telling the user a button will consume token(s) BEFORE they
 * click. Renders nothing when the user wouldn't be charged (e.g. using their own
 * API key) so it never misleads. Additive/inline — does not shift layout.
 */
export function TokenCostBadge({
  cost = 1,
  compact = false,
  className,
}: TokenCostBadgeProps) {
  const { willCharge, balance, isLoading } = useWillChargeToken();

  if (isLoading || !willCharge) return null;

  const unit = cost === 1 ? "token" : "tokens";
  const lowBalance = balance !== null && balance <= 5;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="note"
          aria-label={`Uses ${cost} ${unit}`}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
            "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
            className,
          )}
        >
          <Coins className="size-2.5 shrink-0" aria-hidden="true" />
          {compact ? cost : `${cost} ${unit}`}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[220px]">
        <p className="font-medium">
          Uses {cost} {unit}
        </p>
        <p className="text-xs text-muted-foreground">
          {balance === null
            ? "You're using the app's AI."
            : lowBalance
              ? `Only ${balance} left — running on the app's AI.`
              : `${balance} tokens left. Add your own API key in Settings to stop using tokens.`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
