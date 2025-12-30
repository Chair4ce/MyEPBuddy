"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseIdleDetectionOptions {
  timeout: number; // Idle timeout in milliseconds
  onIdle?: () => void; // Called when user becomes idle
  onActive?: () => void; // Called when user becomes active again
  enabled?: boolean;
}

interface UseIdleDetectionReturn {
  isIdle: boolean;
  lastActivity: Date;
  resetIdleTimer: () => void;
}

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
];

export function useIdleDetection({
  timeout,
  onIdle,
  onActive,
  enabled = true,
}: UseIdleDetectionOptions): UseIdleDetectionReturn {
  const [isIdle, setIsIdle] = useState(false);
  const [lastActivity, setLastActivity] = useState(new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);

  // Keep refs updated
  onIdleRef.current = onIdle;
  onActiveRef.current = onActive;

  const resetIdleTimer = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If was idle, trigger active callback
    if (isIdle) {
      setIsIdle(false);
      onActiveRef.current?.();
    }

    setLastActivity(new Date());

    // Set new timeout
    if (enabled) {
      timeoutRef.current = setTimeout(() => {
        setIsIdle(true);
        onIdleRef.current?.();
      }, timeout);
    }
  }, [isIdle, timeout, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // Add activity listeners
    const handleActivity = () => {
      resetIdleTimer();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial timer
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, resetIdleTimer]);

  return {
    isIdle,
    lastActivity,
    resetIdleTimer,
  };
}





