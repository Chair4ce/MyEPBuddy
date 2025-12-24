"use client";

/**
 * Real-time cursor display components following Supabase UI Library pattern
 * Reference: https://supabase.com/ui/docs/nextjs/realtime-cursor
 */

import { useEffect, useCallback, useRef } from "react";
import { MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeCursors, type CursorPosition, type RemoteCursor } from "@/hooks/use-realtime-cursors";

// Individual cursor component
export function Cursor({
  className,
  style,
  color,
  name,
  rank,
}: {
  className?: string;
  style?: React.CSSProperties;
  color: string;
  name: string;
  rank?: string | null;
}) {
  const displayName = rank ? `${rank} ${name.split(" ")[0]}` : name.split(" ")[0];
  
  return (
    <div 
      className={cn("pointer-events-none absolute transition-all duration-75 ease-out", className)} 
      style={style}
    >
      <MousePointer2 
        color={color} 
        fill={color} 
        size={24}
        className="drop-shadow-md" 
      />
      <div
        className="mt-0.5 ml-3 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap shadow-lg"
        style={{ backgroundColor: color }}
      >
        {displayName}
      </div>
    </div>
  );
}

// Props for the RealtimeCursors component
interface RealtimeCursorsProps {
  roomName: string;
  username: string;
  userRank?: string | null;
  enabled?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  onCursorMove?: (mpaKey: string | null) => void;
}

// Main component that tracks and displays cursors
export function RealtimeCursors({
  roomName,
  username,
  userRank,
  enabled = true,
  containerRef,
  onCursorMove,
}: RealtimeCursorsProps) {
  const { cursors, isConnected, updateCursor } = useRealtimeCursors({
    roomName,
    username,
    userRank,
    enabled,
    throttleMs: 50,
  });

  const currentMpaRef = useRef<string | null>(null);

  // Track mouse movement within the container
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef?.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if mouse is within bounds
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    // Detect which MPA section the cursor is in (if any)
    let mpaKey: string | null = null;
    const target = e.target as HTMLElement;
    const mpaCard = target.closest("[data-mpa-key]");
    if (mpaCard) {
      mpaKey = mpaCard.getAttribute("data-mpa-key");
      if (mpaKey !== currentMpaRef.current) {
        currentMpaRef.current = mpaKey;
        onCursorMove?.(mpaKey);
      }
    }

    updateCursor({ x, y, mpaKey });
  }, [containerRef, updateCursor, onCursorMove]);

  // Add mouse move listener
  useEffect(() => {
    if (!enabled || !containerRef?.current) return;

    const container = containerRef.current;
    container.addEventListener("mousemove", handleMouseMove);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
    };
  }, [enabled, containerRef, handleMouseMove]);

  // Render remote cursors
  const remoteCursors = Object.values(cursors);

  if (!enabled || !isConnected || remoteCursors.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {remoteCursors.map((cursor) => (
        <Cursor
          key={cursor.oderId}
          color={cursor.color}
          name={cursor.name}
          rank={cursor.rank}
          style={{
            left: cursor.x,
            top: cursor.y,
          }}
        />
      ))}
    </div>
  );
}

// Cursor indicator showing who's editing which MPA
export function CursorMpaIndicator({
  cursors,
  mpaKey,
}: {
  cursors: Record<string, RemoteCursor>;
  mpaKey: string;
}) {
  const cursorsInMpa = Object.values(cursors).filter(
    (c) => c.mpaKey === mpaKey
  );

  if (cursorsInMpa.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {cursorsInMpa.slice(0, 3).map((cursor) => (
        <div
          key={cursor.oderId}
          className="size-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-background"
          style={{ backgroundColor: cursor.color }}
          title={cursor.rank ? `${cursor.rank} ${cursor.name}` : cursor.name}
        >
          {cursor.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {cursorsInMpa.length > 3 && (
        <div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium ring-2 ring-background">
          +{cursorsInMpa.length - 3}
        </div>
      )}
    </div>
  );
}

