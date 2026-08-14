"use client";

import { Suspense, use, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadFeedbackSessions,
  type FeedbackShellType,
} from "@/lib/feedback-sessions";
import { MessageSquare } from "lucide-react";

interface FeedbackBadgeProps {
  shellType: FeedbackShellType;
  shellId: string;
  onClick: () => void;
  className?: string;
  refreshKey?: number;
}

function FeedbackBadgeArmed({
  shellType,
  shellId,
  bust,
  onClick,
  className,
}: {
  shellType: FeedbackShellType;
  shellId: string;
  bust: number;
  onClick: () => void;
  className?: string;
}) {
  const sessions = use(loadFeedbackSessions(shellType, shellId, bust));
  const pending = sessions.reduce((sum, s) => sum + (s.pending_count || 0), 0);
  const total = sessions.reduce((sum, s) => sum + (s.comment_count || 0), 0);

  if (total === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn("gap-2 relative", className)}
      aria-label={`Reviewer feedback${pending > 0 ? `, ${pending} pending` : ""}`}
    >
      <MessageSquare className="size-4" />
      <span>Feedback</span>
      {pending > 0 && (
        <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-amber-500 text-white text-xs font-medium flex items-center justify-center">
          {pending}
        </span>
      )}
    </Button>
  );
}

function PlaceholderBadge({
  onClick,
  onArm,
  className,
}: {
  onClick: () => void;
  onArm: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        onArm();
        onClick();
      }}
      onMouseEnter={onArm}
      onFocus={onArm}
      className={cn("gap-2 relative", className)}
      aria-label="Reviewer feedback"
    >
      <MessageSquare className="size-4" />
      <span>Feedback</span>
    </Button>
  );
}

export function FeedbackBadge({
  shellType,
  shellId,
  onClick,
  className,
  refreshKey = 0,
}: FeedbackBadgeProps) {
  const [armed, setArmed] = useState(false);
  const [bust, setBust] = useState(0);
  const [prevShell, setPrevShell] = useState(`${shellType}:${shellId}`);
  const [prevRefresh, setPrevRefresh] = useState(refreshKey);
  const shellKey = `${shellType}:${shellId}`;

  if (shellKey !== prevShell) {
    setPrevShell(shellKey);
    setArmed(false);
    setBust((n) => n + 1);
  }
  if (refreshKey !== prevRefresh) {
    setPrevRefresh(refreshKey);
    setArmed(true);
    setBust((n) => n + 1);
  }

  const arm = () => setArmed(true);

  if (!armed) {
    return (
      <PlaceholderBadge onClick={onClick} onArm={arm} className={className} />
    );
  }

  return (
    <Suspense
      fallback={
        <PlaceholderBadge onClick={onClick} onArm={arm} className={className} />
      }
    >
      <FeedbackBadgeArmed
        key={`${shellKey}-${bust}`}
        shellType={shellType}
        shellId={shellId}
        bust={bust}
        onClick={onClick}
        className={className}
      />
    </Suspense>
  );
}
