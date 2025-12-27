"use client";

/**
 * Real-time cursor tracking hook following Supabase UI Library pattern
 * Reference: https://supabase.com/ui/docs/nextjs/realtime-cursor
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_SUBSCRIBE_STATES, RealtimeChannel } from "@supabase/supabase-js";

// Cursor position data
export interface CursorPosition {
  x: number;
  y: number;
  mpaKey?: string | null; // Which MPA section the cursor is in
}

// Remote cursor with user info
export interface RemoteCursor {
  oderId: string;
  x: number;
  y: number;
  mpaKey?: string | null;
  color: string;
  name: string;
  rank?: string | null;
  lastUpdate: number;
}

// Generate a random color for cursor
const CURSOR_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f43f5e", // rose-500
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

interface UseRealtimeCursorsOptions {
  roomName: string;
  username: string;
  userRank?: string | null;
  throttleMs?: number; // How often to send cursor updates (default 50ms)
  enabled?: boolean;
}

interface UseRealtimeCursorsReturn {
  cursors: Record<string, RemoteCursor>;
  isConnected: boolean;
  updateCursor: (position: CursorPosition) => void;
}

export function useRealtimeCursors({
  roomName,
  username,
  userRank,
  throttleMs = 50,
  enabled = true,
}: UseRealtimeCursorsOptions): UseRealtimeCursorsReturn {
  const supabase = createClient();
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const [isConnected, setIsConnected] = useState(false);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const colorRef = useRef<string>(getRandomColor());
  const lastSentRef = useRef<number>(0);
  const userIdRef = useRef<string>(`user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Send cursor position with throttling
  const updateCursor = useCallback((position: CursorPosition) => {
    if (!channelRef.current || !isConnected) return;
    
    const now = Date.now();
    if (now - lastSentRef.current < throttleMs) return;
    lastSentRef.current = now;

    // Broadcast cursor position to all users in the room
    channelRef.current.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        oderId: userIdRef.current,
        x: position.x,
        y: position.y,
        mpaKey: position.mpaKey,
        color: colorRef.current,
        name: username,
        rank: userRank,
      },
    });
  }, [isConnected, throttleMs, username, userRank]);

  // Subscribe to cursor channel
  useEffect(() => {
    if (!enabled || !roomName) return;

    const channel = supabase.channel(`cursors:${roomName}`, {
      config: {
        broadcast: { self: false }, // Don't receive own broadcasts
      },
    });

    // Listen for cursor broadcasts
    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        if (!payload || payload.oderId === userIdRef.current) return;
        
        setCursors((prev) => ({
          ...prev,
          [payload.oderId]: {
            oderId: payload.oderId,
            x: payload.x,
            y: payload.y,
            mpaKey: payload.mpaKey,
            color: payload.color,
            name: payload.name,
            rank: payload.rank,
            lastUpdate: Date.now(),
          },
        }));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        // Remove cursor when user leaves
        setCursors((prev) => {
          const updated = { ...prev };
          delete updated[key];
          return updated;
        });
      })
      .subscribe(async (status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setIsConnected(true);
          await channel.track({ key: userIdRef.current });
          channelRef.current = channel;
        } else {
          setIsConnected(false);
          channelRef.current = null;
        }
      });

    // Cleanup stale cursors every 3 seconds
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const updated: Record<string, RemoteCursor> = {};
        Object.entries(prev).forEach(([id, cursor]) => {
          // Keep cursors that have been updated in the last 5 seconds
          if (now - cursor.lastUpdate < 5000) {
            updated[id] = cursor;
          }
        });
        return updated;
      });
    }, 3000);

    return () => {
      clearInterval(cleanupInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
      setCursors({});
    };
  }, [enabled, roomName, supabase]);

  return {
    cursors,
    isConnected,
    updateCursor,
  };
}



