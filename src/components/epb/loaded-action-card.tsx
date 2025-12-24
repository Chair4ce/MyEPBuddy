"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import type { Accomplishment } from "@/types/database";

interface LoadedActionCardProps {
  action: Accomplishment;
  statementNumber?: 1 | 2; // For two-statement mode
  onRemove: () => void;
  compact?: boolean;
}

export function LoadedActionCard({
  action,
  statementNumber,
  onRemove,
  compact = false,
}: LoadedActionCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Build a copyable summary
  const actionSummary = `${action.action_verb}: ${action.details}. Impact: ${action.impact}${action.metrics ? `. Metrics: ${action.metrics}` : ""}`;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all duration-200",
        isExpanded ? "shadow-sm" : "shadow-none",
        statementNumber === 1 && "border-l-2 border-l-blue-500",
        statementNumber === 2 && "border-l-2 border-l-purple-500"
      )}
    >
      {/* Header - Always visible */}
      <div className="flex items-center gap-2 p-2">
        <button 
          className="flex items-center gap-2 flex-1 min-w-0 text-left group"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="size-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="size-3 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {action.action_verb}
            </p>
            {!isExpanded && (
              <p className="text-[10px] text-muted-foreground truncate">
                {action.details.slice(0, 60)}...
              </p>
            )}
          </div>
          {statementNumber && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] shrink-0",
                statementNumber === 1 && "border-blue-500/50 text-blue-600",
                statementNumber === 2 && "border-purple-500/50 text-purple-600"
              )}
            >
              S{statementNumber}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
        <button
          className="inline-flex items-center justify-center rounded-md size-6 shrink-0 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Expandable content - conditionally rendered */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
          <div className="p-2 rounded bg-muted/30 text-xs space-y-1.5">
            <div>
              <span className="font-medium text-muted-foreground">Details: </span>
              <span>{action.details}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Impact: </span>
              <span>{action.impact}</span>
            </div>
            {action.metrics && (
              <div>
                <span className="font-medium text-muted-foreground">Metrics: </span>
                <span>{action.metrics}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {new Date(action.date).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </Badge>
            <button
              className="inline-flex items-center justify-center rounded-md h-6 px-2 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => handleCopy(actionSummary)}
            >
              {copied ? (
                <Check className="size-3 mr-1" />
              ) : (
                <Copy className="size-3 mr-1" />
              )}
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
