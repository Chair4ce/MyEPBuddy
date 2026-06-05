"use client";

import { cn } from "@/lib/utils";

/** Duration for generated results to collapse after "Use This" */
export const EPB_GENERATED_RESULTS_CLOSE_MS = 520;

/** Duration for an entire panel to collapse after results are gone */
export const EPB_PANEL_CLOSE_MS = 480;

interface EpbAnimatedCollapseProps {
  /** Keep mounted while animating closed */
  visible: boolean;
  closing?: boolean;
  durationMs?: number;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}

/**
 * Smooth height + opacity collapse using CSS grid.
 * Parent should set `closing`, wait `durationMs`, then unmount via `visible={false}`.
 */
export function EpbAnimatedCollapse({
  visible,
  closing = false,
  durationMs = EPB_GENERATED_RESULTS_CLOSE_MS,
  className,
  innerClassName,
  children,
}: EpbAnimatedCollapseProps) {
  if (!visible) return null;

  const isCollapsed = closing;

  return (
    <div
      className={cn(
        "grid motion-reduce:transition-none",
        "transition-[grid-template-rows,opacity,margin,padding,border-color]",
        isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        className
      )}
      style={{
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      aria-hidden={isCollapsed}
    >
      <div className={cn("overflow-hidden min-h-0", innerClassName)}>{children}</div>
    </div>
  );
}
