"use client";

import { Suspense, use, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTimeDetailed } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  loadFeedbackSessions,
  invalidateFeedbackSessionsCache,
  type FeedbackShellType,
} from "@/lib/feedback-sessions";
import { Loader2, MessageSquare, User, Calendar, ChevronRight } from "lucide-react";

interface FeedbackListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shellType: FeedbackShellType;
  shellId: string;
  onViewSession: (sessionId: string) => void;
}

function FeedbackSessionsBody({
  shellType,
  shellId,
  bust,
  onViewSession,
  onOpenChange,
}: {
  shellType: FeedbackShellType;
  shellId: string;
  bust: number;
  onViewSession: (sessionId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const sessions = use(loadFeedbackSessions(shellType, shellId, bust));
  const totalPending = sessions.reduce(
    (sum, s) => sum + (s.pending_count || 0),
    0
  );

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="size-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No feedback received yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Share your {shellType.toUpperCase()} with a mentor to get feedback
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {totalPending > 0 && (
        <Badge variant="secondary" className="w-fit">
          {totalPending} pending
        </Badge>
      )}
      <ScrollArea className="h-full max-h-[50vh]">
        <div className="space-y-2 pr-4">
          {sessions.map((session) => (
            <button
              type="button"
              key={session.id}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border text-left",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              onClick={() => {
                onViewSession(session.id);
                onOpenChange(false);
              }}
            >
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {session.reviewer_name}
                  </span>
                  {session.pending_count > 0 && (
                    <Badge variant="secondary" className="shrink-0">
                      {session.pending_count} pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Calendar className="size-3" />
                  <span>{formatDateTimeDetailed(session.submitted_at)}</span>
                  <span>•</span>
                  <span>{session.comment_count} comments</span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function FeedbackListDialog({
  open,
  onOpenChange,
  shellType,
  shellId,
  onViewSession,
}: FeedbackListDialogProps) {
  // Bump when dialog opens so each open refetches (cache bust) without useEffect.
  const [bust, setBust] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      invalidateFeedbackSessionsCache(shellType, shellId);
      setBust((n) => n + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Reviewer Feedback
          </DialogTitle>
          <DialogDescription>
            Review feedback from your mentors
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {open ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <FeedbackSessionsBody
                key={`${shellType}-${shellId}-${bust}`}
                shellType={shellType}
                shellId={shellId}
                bust={bust}
                onViewSession={onViewSession}
                onOpenChange={onOpenChange}
              />
            </Suspense>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
