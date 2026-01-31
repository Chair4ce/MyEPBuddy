"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, User, Calendar, ChevronRight } from "lucide-react";

interface FeedbackSession {
  id: string;
  reviewer_name: string;
  reviewer_name_source: string;
  comment_count: number;
  submitted_at: string;
  pending_count: number;
  accepted_count: number;
  dismissed_count: number;
  link_label?: string;
  is_anonymous?: boolean;
}

interface FeedbackListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  onViewSession: (sessionId: string) => void;
}

export function FeedbackListDialog({
  open,
  onOpenChange,
  shellType,
  shellId,
  onViewSession,
}: FeedbackListDialogProps) {
  const [sessions, setSessions] = useState<FeedbackSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    async function loadSessions() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/feedback?shellType=${shellType}&shellId=${shellId}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load feedback");
        }

        setSessions(data.sessions || []);
      } catch (error) {
        console.error("Load sessions error:", error);
        toast.error("Failed to load feedback sessions");
      } finally {
        setIsLoading(false);
      }
    }

    loadSessions();
  }, [open, shellType, shellId]);

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const totalPending = sessions.reduce((sum, s) => sum + (s.pending_count || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Reviewer Feedback
            {totalPending > 0 && (
              <Badge variant="secondary" className="ml-2">
                {totalPending} pending
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Review feedback from your mentors
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="size-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No feedback received yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Share your {shellType.toUpperCase()} with a mentor to get feedback
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[50vh]">
              <div className="space-y-2 pr-4">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
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
                        <span>{formatDate(session.submitted_at)}</span>
                        <span>•</span>
                        <span>{session.comment_count} comments</span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
