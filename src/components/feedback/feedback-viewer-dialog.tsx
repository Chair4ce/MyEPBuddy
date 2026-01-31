"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, MessageSquare, ArrowLeft } from "lucide-react";

interface FeedbackComment {
  id: string;
  section_key: string;
  original_text?: string;
  highlight_start?: number;
  highlight_end?: number;
  highlighted_text?: string;
  comment_text: string;
  suggestion?: string;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
}

interface FeedbackSession {
  id: string;
  reviewer_name: string;
  comment_count: number;
  submitted_at: string;
  pending_count: number;
}

// MPA labels
const MPA_LABELS: Record<string, string> = {
  executing_mission: "Executing the Mission",
  leading_people: "Leading People",
  managing_resources: "Managing Resources",
  improving_unit: "Improving the Unit",
  hlr_assessment: "HLR Assessment",
  duty_description: "Duty Description",
  general: "General",
};

interface FeedbackViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  onBack?: () => void;
}

export function FeedbackViewerDialog({
  open,
  onOpenChange,
  sessionId,
  shellType,
  shellId,
  onBack,
}: FeedbackViewerDialogProps) {
  const [sessions, setSessions] = useState<FeedbackSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Load sessions list
  useEffect(() => {
    if (!open) return;

    async function loadSessions() {
      try {
        const response = await fetch(
          `/api/feedback?shellType=${shellType}&shellId=${shellId}`
        );
        const data = await response.json();

        if (response.ok && data.sessions) {
          setSessions(data.sessions);
          // If no session selected, select the first one
          if (!currentSessionId && data.sessions.length > 0) {
            setCurrentSessionId(data.sessions[0].id);
          }
        }
      } catch (error) {
        console.error("Load sessions error:", error);
      }
    }

    loadSessions();
  }, [open, shellType, shellId, currentSessionId]);

  // Update current session when prop changes
  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [sessionId]);

  // Load comments for current session
  useEffect(() => {
    if (!open || !currentSessionId) return;

    async function loadComments() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/feedback/${currentSessionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load comments");
        }

        setComments(data.comments || []);
      } catch (error) {
        console.error("Load comments error:", error);
        toast.error("Failed to load comments");
      } finally {
        setIsLoading(false);
      }
    }

    loadComments();
  }, [open, currentSessionId]);

  // Handle accept/dismiss
  const handleUpdateStatus = useCallback(async (commentId: string, status: "accepted" | "dismissed") => {
    setIsUpdating(commentId);
    try {
      const response = await fetch(`/api/feedback/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update comment");
      }

      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, status } : c
        )
      );

      toast.success(status === "accepted" ? "Comment accepted" : "Comment dismissed");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update comment");
    } finally {
      setIsUpdating(null);
    }
  }, []);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const pendingCount = comments.filter((c) => c.status === "pending").length;

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
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

  // Group comments by section
  const commentsBySection: Record<string, FeedbackComment[]> = {};
  comments.forEach((comment) => {
    const key = comment.section_key;
    if (!commentsBySection[key]) {
      commentsBySection[key] = [];
    }
    commentsBySection[key].push(comment);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="size-5" />
                Feedback from {currentSession?.reviewer_name || "Mentor"}
              </DialogTitle>
              {currentSession && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(currentSession.submitted_at)} • {currentSession.comment_count} comments
                  {pendingCount > 0 && ` • ${pendingCount} pending`}
                </p>
              )}
            </div>
          </div>

          {/* Session switcher */}
          {sessions.length > 1 && (
            <div className="mt-3">
              <Select
                value={currentSessionId || ""}
                onValueChange={setCurrentSessionId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select feedback session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      <div className="flex items-center gap-2">
                        <span>{session.reviewer_name}</span>
                        <span className="text-muted-foreground">
                          ({session.comment_count} comments)
                        </span>
                        {session.pending_count > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {session.pending_count} pending
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogHeader>

        {/* Comments */}
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No comments found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(commentsBySection).map(([sectionKey, sectionComments]) => (
                <div key={sectionKey}>
                  <h3 className="font-medium text-sm text-muted-foreground mb-3">
                    {MPA_LABELS[sectionKey] || sectionKey}
                  </h3>
                  <div className="space-y-3">
                    {sectionComments.map((comment) => (
                      <div
                        key={comment.id}
                        className={cn(
                          "p-4 rounded-lg border",
                          comment.status === "accepted" && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                          comment.status === "dismissed" && "bg-muted/50 opacity-60",
                          comment.status === "pending" && "bg-card"
                        )}
                      >
                        {/* Highlighted text */}
                        {comment.highlighted_text && (
                          <div className="mb-3 pb-3 border-b">
                            <p className="text-xs text-muted-foreground mb-1">Highlighted text:</p>
                            <p className="text-sm italic bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
                              &ldquo;{comment.highlighted_text}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Comment text */}
                        <p className={cn(
                          "text-sm",
                          comment.status === "dismissed" && "line-through"
                        )}>
                          {comment.comment_text}
                        </p>

                        {/* Suggestion */}
                        {comment.suggestion && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Suggested replacement:</p>
                            <p className="text-sm italic bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
                              {comment.suggestion}
                            </p>
                          </div>
                        )}

                        {/* Status indicator */}
                        {comment.status !== "pending" && (
                          <div className="mt-3 pt-3 border-t">
                            <span className={cn(
                              "text-xs font-medium",
                              comment.status === "accepted" && "text-green-600 dark:text-green-400",
                              comment.status === "dismissed" && "text-muted-foreground"
                            )}>
                              {comment.status === "accepted" ? "✓ Accepted" : "Dismissed"}
                            </span>
                          </div>
                        )}

                        {/* Action buttons for pending */}
                        {comment.status === "pending" && (
                          <div className="mt-3 pt-3 border-t flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleUpdateStatus(comment.id, "accepted")}
                              disabled={isUpdating === comment.id}
                            >
                              {isUpdating === comment.id ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : (
                                <Check className="size-3 mr-1" />
                              )}
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleUpdateStatus(comment.id, "dismissed")}
                              disabled={isUpdating === comment.id}
                            >
                              <X className="size-3 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
