"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  motionEnter,
  motionEnterDurNormal,
  motionPressOnly,
  motionSurfaceElevated,
} from "@/lib/motion/classes";
import { Sparkles, X } from "lucide-react";

const emptySubscribe = () => () => {};

export interface FuseToEpbBarProps {
  selectedCount: number;
  canFuse: boolean;
  onClear: () => void;
  onFuse: () => void;
}

/**
 * Viewport-fixed selection bar. Portaled to document.body so PageTransition's
 * fade-in transform cannot trap position:fixed (which would scroll with the list).
 */
export function FuseToEpbBar({
  selectedCount,
  canFuse,
  onClear,
  onFuse,
}: FuseToEpbBarProps) {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!isClient || selectedCount <= 0) return null;

  return createPortal(
    <div
      className="fixed bottom-4 left-1/2 z-40 w-[min(100%-1.5rem,42rem)] -translate-x-1/2"
      role="region"
      aria-label="Generate EPB statement from selection"
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl bg-background/95 px-3 py-2.5 backdrop-blur-sm",
          motionSurfaceElevated,
          motionEnter,
          motionEnterDurNormal
        )}
      >
        <Badge variant="secondary" className="tabular-nums shrink-0">
          {selectedCount} selected
        </Badge>
        <div className="flex-1 min-w-0" />
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8", motionPressOnly)}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="size-3.5 mr-1.5" />
          Clear
        </Button>
        <Button
          size="sm"
          className={cn("h-8", motionPressOnly)}
          disabled={!canFuse}
          onClick={onFuse}
          aria-label="Generate EPB statement from selected accomplishments"
        >
          <Sparkles className="size-3.5 mr-1.5" />
          Generate statement
        </Button>
      </div>
    </div>,
    document.body
  );
}
