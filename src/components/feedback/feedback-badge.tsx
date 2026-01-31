"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface FeedbackBadgeProps {
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  onClick: () => void;
  className?: string;
}

export function FeedbackBadge({
  shellType,
  shellId,
  onClick,
  className,
}: FeedbackBadgeProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function loadCount() {
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
        }
      } catch (error) {
        console.error("Load feedback count error:", error);
      }
    }

    if (shellId) {
      loadCount();
    }
  }, [shellType, shellId]);

  if (totalCount === 0) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
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
