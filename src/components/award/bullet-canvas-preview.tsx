"use client";

import { cn } from "@/lib/utils";

/**
 * Simplified spacing control for AF Form 1206 statements.
 * Based on pdf-bullets project: https://github.com/AF-VCD/pdf-bullets
 * 
 * Provides simple Compress/Expand toggle buttons for adjusting
 * character spacing to fit text within 1206 form constraints.
 */

interface SpacingControlProps {
  text: string;
  className?: string;
  onCompress?: () => void;
  onExpand?: () => void;
  onNormalize?: () => void;
}

export function BulletSpacingControl({
  text,
  className = "",
  onCompress,
  onExpand,
  onNormalize,
}: SpacingControlProps) {
  // Check if text contains special spacing
  const isCompressed = text.includes('\u2006'); // thin space
  const isExpanded = text.includes('\u2004');   // medium space
  const isModified = isCompressed || isExpanded;

  const charCount = text.length;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      {/* Character count */}
      <span className="text-xs text-muted-foreground">
        {charCount} chars
      </span>

      {/* Spacing controls */}
      <div className="flex items-center gap-1">
        {isModified ? (
          <>
            {/* Show current state indicator and normalize button */}
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded border",
              isCompressed 
                ? "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                : "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
            )}>
              {isCompressed ? "Compressed" : "Expanded"}
            </span>
            <button
              onClick={onNormalize}
              disabled={!onNormalize}
              className={cn(
                "text-xs px-2 py-0.5 rounded border transition-colors",
                "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                !onNormalize && "opacity-50 cursor-not-allowed"
              )}
              title="Reset to normal spacing"
            >
              Normal
            </button>
          </>
        ) : (
          <>
            {/* Show compress/expand options */}
            <button
              onClick={onCompress}
              disabled={!onCompress}
              className={cn(
                "text-xs px-2 py-0.5 rounded border transition-colors",
                "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                "dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50",
                !onCompress && "opacity-50 cursor-not-allowed"
              )}
              title="Compress spacing to fit more text"
            >
              Compress
            </button>
            <button
              onClick={onExpand}
              disabled={!onExpand}
              className={cn(
                "text-xs px-2 py-0.5 rounded border transition-colors",
                "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
                "dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/50",
                !onExpand && "opacity-50 cursor-not-allowed"
              )}
              title="Expand spacing to fill more space"
            >
              Expand
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Re-export for backwards compatibility during transition
export { BulletSpacingControl as BulletCanvasPreview };
export type { SpacingControlProps as LineFillIndicatorProps };
export interface LineMetric {
  text: string;
  width: number;
  fillPercent: number;
  isOverflow: boolean;
  isCompressed: boolean;
  startIndex: number;
  endIndex: number;
}
