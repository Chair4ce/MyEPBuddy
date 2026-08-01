"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface FeedbackBadgeProps {
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  onClick: () => void;
  className?: string;
  refreshKey?: number; // Increment to force refresh
}

export function FeedbackBadge({
  shellType,
  shellId,
  onClick,
  className,
  refreshKey = 0,
}: FeedbackBadgeProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/feedback?shellType=${shellType}&shellId=${shellId}`
      );
      const data = await response.json();

      if (response.ok && data.sessions) {
        const sessions = data.sessions as Array<{ pending_count: number; comment_count: number }>;
        const pending = sessions.reduce((sum, s) => sum + (s.pending_count || 0), 0);
        const total = sessions.reduce((sum, s) => sum + (s.comment_count || 0), 0);
        setPendingCount(pending);
        setTotalCount(total);
        setHasLoaded(true);
      }
    } catch (error) {
      console.error("Load feedback count error:", error);
    }
  }, [shellType, shellId]);

  const handlePrefetch = () => {
    void loadCount();
  };

  const handleClick = () => {
    if (!hasLoaded) {
      void loadCount();
    }
    onClick();
  };

  if (totalCount === 0 && hasLoaded) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      className={cn("gap-2 relative", className)}
    >
      <MessageSquare className="size-4" />
      <span>Feedback</span>
      {pendingCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-amber-500 text-white text-xs font-medium flex items-center justify-center">
          {pendingCount}
        </span>
      )}
    </Button>
  );
}
