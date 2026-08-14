"use client";

import { Suspense, use, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { formatShortDateWithYear } from "@/lib/format";
import { toast } from "@/components/ui/sonner";
import { cn, normalizeText } from "@/lib/utils";
import {
  loadFeedbackSessions,
  loadFeedbackSessionDetail,
  invalidateFeedbackSessionsCache,
  invalidateFeedbackSessionDetailCache,
  resolveFeedbackViewerSessionId,
  type FeedbackComment,
  type FeedbackShellType,
} from "@/lib/feedback-sessions";
import { FeedbackCommentCard } from "@/components/feedback/feedback-comment-card";
import {
  motionCollapseGrid,
  motionEnter,
  motionEnterFade,
  motionEnterDurList,
  motionEnterDurNormal,
  motionListEnterStagger,
  motionPressable,
  motionTransitionColors,
} from "@/lib/motion/classes";
import {
  Loader2,
  Check,
  MessageSquare,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

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
  shellType: FeedbackShellType;
  shellId: string;
  onBack?: () => void;
  onApplySuggestion?: (sectionKey: string, newText: string) => void;
  getCurrentText?: (sectionKey: string) => string;
}

async function applySuggestionWithLLM(
  snapshotText: string,
  currentText: string,
  comment: FeedbackComment
): Promise<{
  success: boolean;
  newText: string;
  aborted?: boolean;
  reason?: string;
  needsReview?: boolean;
  reviewReason?: string;
}> {
  if (comment.is_full_rewrite && comment.rewrite_text) {
    return { success: true, newText: comment.rewrite_text };
  }

  const highlightedText = comment.highlighted_text;
  const suggestionType = comment.suggestion_type;

  if (
    !highlightedText ||
    (suggestionType !== "delete" && suggestionType !== "replace")
  ) {
    return {
      success: false,
      newText: currentText,
      aborted: true,
      reason: "Missing highlight information or unsupported suggestion type",
    };
  }

  try {
    const response = await fetch("/api/feedback/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentText,
        snapshotText,
        suggestionType,
        highlightedText,
        replacementText: comment.replacement_text,
        commentText: comment.comment_text,
      }),
    });

    const result = await response.json();

    if (result.success && result.newText) {
      return {
        success: true,
        newText: result.newText,
        needsReview: result.needsReview,
        reviewReason: result.reviewReason,
      };
    }
    if (result.aborted) {
      return {
        success: false,
        newText: currentText,
        aborted: true,
        reason: result.reason || "Could not apply the suggested change",
      };
    }
    return {
      success: false,
      newText: currentText,
      aborted: true,
      reason: result.error || "Failed to apply suggestion",
    };
  } catch (error) {
    console.error("Error calling apply feedback API:", error);
    return {
      success: false,
      newText: currentText,
      aborted: true,
      reason: "Network error - please try again",
    };
  }
}

function FeedbackViewerFallback({
  onBack,
}: {
  onBack?: () => void;
}) {
  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to feedback list">
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Feedback from Reviewer
          </DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Loading reviewer comments
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    </>
  );
}

function FeedbackViewerBody({
  shellType,
  shellId,
  preferredSessionId,
  bust,
  onBack,
  onSessionChange,
  onApplySuggestion,
  getCurrentText,
}: {
  shellType: FeedbackShellType;
  shellId: string;
  preferredSessionId: string | null;
  bust: number;
  onBack?: () => void;
  onSessionChange: (sessionId: string) => void;
  onApplySuggestion?: (sectionKey: string, newText: string) => void;
  getCurrentText?: (sectionKey: string) => string;
}) {
  if (preferredSessionId) {
    void loadFeedbackSessionDetail(preferredSessionId, bust);
  }
  const sessions = use(loadFeedbackSessions(shellType, shellId, bust));
  const sessionId = resolveFeedbackViewerSessionId(preferredSessionId, sessions);

  if (!sessionId) {
    return (
      <>
        <FeedbackViewerHeader
          onBack={onBack}
          reviewerName="Reviewer"
          submittedAt={null}
          sessions={sessions}
          currentSessionId={null}
          onSessionChange={onSessionChange}
        />
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No comments found</p>
        </div>
      </>
    );
  }

  return (
    <FeedbackViewerSession
      sessionId={sessionId}
      sessions={sessions}
      bust={bust}
      onBack={onBack}
      onSessionChange={onSessionChange}
      onApplySuggestion={onApplySuggestion}
      getCurrentText={getCurrentText}
    />
  );
}

function FeedbackViewerHeader({
  onBack,
  reviewerName,
  submittedAt,
  sessions,
  currentSessionId,
  onSessionChange,
}: {
  onBack?: () => void;
  reviewerName: string;
  submittedAt: string | null;
  sessions: Array<{ id: string; reviewer_name: string }>;
  currentSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
}) {
  return (
    <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to feedback list">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="flex-1">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Feedback from {reviewerName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review comments and suggested edits from {reviewerName}
          </DialogDescription>
          {submittedAt && (
            <p className="text-sm text-muted-foreground mt-1">
              {formatShortDateWithYear(submittedAt)}
            </p>
          )}
        </div>
      </div>

      {sessions.length > 1 && (
        <div className="mt-3">
          <Select
            value={currentSessionId || ""}
            onValueChange={onSessionChange}
          >
            <SelectTrigger className="w-full" aria-label="Select feedback session">
              <SelectValue placeholder="Select feedback session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.reviewer_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </DialogHeader>
  );
}

function FeedbackViewerSession({
  sessionId,
  sessions,
  bust,
  onBack,
  onSessionChange,
  onApplySuggestion,
  getCurrentText,
}: {
  sessionId: string;
  sessions: Array<{
    id: string;
    reviewer_name: string;
    submitted_at: string;
  }>;
  bust: number;
  onBack?: () => void;
  onSessionChange: (sessionId: string) => void;
  onApplySuggestion?: (sectionKey: string, newText: string) => void;
  getCurrentText?: (sectionKey: string) => string;
}) {
  const detail = use(loadFeedbackSessionDetail(sessionId, bust));
  const [comments, setComments] = useState<FeedbackComment[]>(detail.comments);
  const [prevDetail, setPrevDetail] = useState(detail);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(detail.comments.map((c) => c.section_key))
  );
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    show: boolean;
    currentText: string;
    proposedText: string;
    reviewReason: string;
    sectionKey: string;
    commentId: string;
  } | null>(null);

  if (detail !== prevDetail) {
    setPrevDetail(detail);
    setComments(detail.comments);
    setExpandedSections(new Set(detail.comments.map((c) => c.section_key)));
  }

  const currentSession = sessions.find((s) => s.id === sessionId);
  const contentSnapshot = detail.contentSnapshot;

  const commentsBySection = useMemo(() => {
    const grouped: Record<string, FeedbackComment[]> = {};
    comments.forEach((comment) => {
      const key = comment.section_key;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(comment);
    });
    return grouped;
  }, [comments]);

  const getSectionText = (sectionKey: string): string => {
    if (!contentSnapshot) return "";
    let text = "";
    if (sectionKey === "duty_description") {
      text = contentSnapshot.duty_description || "";
    } else {
      const section = contentSnapshot.sections?.find((s) => s.mpa === sectionKey);
      text = section?.statement_text || "";
    }
    return normalizeText(text);
  };

  const handleUpdateStatus = async (
    commentId: string,
    status: "accepted" | "dismissed"
  ) => {
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
        prev.map((c) => (c.id === commentId ? { ...c, status } : c))
      );
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update feedback");
    } finally {
      setIsUpdating(null);
    }
  };

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  return (
    <>
      <FeedbackViewerHeader
        onBack={onBack}
        reviewerName={currentSession?.reviewer_name || "Reviewer"}
        submittedAt={currentSession?.submitted_at ?? null}
        sessions={sessions}
        currentSessionId={sessionId}
        onSessionChange={onSessionChange}
      />

      <ScrollArea className="flex-1 min-h-0">
        <div className={cn("px-6 py-4", motionEnterFade, motionEnterDurNormal)}>
          {detail.error ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">{detail.error}</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No comments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(commentsBySection).map(
                ([sectionKey, sectionComments], sectionIndex) => {
                  const sectionText = getSectionText(sectionKey);
                  const isExpanded = expandedSections.has(sectionKey);

                  return (
                    <div
                      key={sectionKey}
                      className={cn(
                        "border rounded-lg overflow-hidden",
                        motionEnter,
                        motionEnterDurList
                      )}
                      style={motionListEnterStagger(sectionIndex)}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className={cn(
                          motionPressable,
                          motionTransitionColors,
                          "w-full px-4 py-3 flex items-center justify-between bg-muted/50 hover:bg-muted/70 text-left"
                        )}
                        aria-expanded={isExpanded}
                        aria-controls={`feedback-section-${sectionKey}`}
                      >
                        <span className="font-medium">
                          {MPA_LABELS[sectionKey] || sectionKey}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </button>

                      <div
                        id={`feedback-section-${sectionKey}`}
                        className={motionCollapseGrid}
                        data-open={isExpanded ? "true" : "false"}
                      >
                        <div>
                          <div className="p-4 space-y-4">
                            {sectionComments.map((comment, idx) => (
                              <div key={comment.id}>
                                {idx > 0 && <Separator className="my-4" />}
                                <FeedbackCommentCard
                                  comment={comment}
                                  sectionText={sectionText}
                                  currentText={
                                    getCurrentText
                                      ? getCurrentText(sectionKey)
                                      : sectionText
                                  }
                                  isUpdating={isUpdating === comment.id}
                                  onMarkRead={() =>
                                    handleUpdateStatus(comment.id, "accepted")
                                  }
                                  onIgnore={() =>
                                    handleUpdateStatus(comment.id, "dismissed")
                                  }
                                  onApply={
                                    onApplySuggestion
                                      ? async () => {
                                          const currentTextVal = getCurrentText
                                            ? getCurrentText(sectionKey)
                                            : sectionText;
                                          setIsUpdating(comment.id);

                                          try {
                                            const result =
                                              await applySuggestionWithLLM(
                                                sectionText,
                                                currentTextVal,
                                                comment
                                              );

                                            if (result.success) {
                                              if (result.needsReview) {
                                                setReviewConfirmation({
                                                  show: true,
                                                  currentText: currentTextVal,
                                                  proposedText: result.newText,
                                                  reviewReason:
                                                    result.reviewReason ||
                                                    "The AI made changes that may differ from what was expected.",
                                                  sectionKey,
                                                  commentId: comment.id,
                                                });
                                              } else {
                                                onApplySuggestion(
                                                  sectionKey,
                                                  result.newText
                                                );
                                                await handleUpdateStatus(
                                                  comment.id,
                                                  "accepted"
                                                );
                                                toast.success(
                                                  "Suggestion applied successfully"
                                                );
                                              }
                                            } else if (result.aborted) {
                                              toast.error(
                                                result.reason ||
                                                  "Could not apply suggestion"
                                              );
                                            }
                                          } catch (error) {
                                            console.error(
                                              "Error applying suggestion:",
                                              error
                                            );
                                            toast.error(
                                              "Failed to apply suggestion"
                                            );
                                          } finally {
                                            setIsUpdating(null);
                                          }
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {reviewConfirmation?.show && (
        <Dialog
          open={reviewConfirmation.show}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setReviewConfirmation(null);
          }}
        >
          <DialogContent className="!max-w-5xl w-[90vw] max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-5" />
                Review AI Changes
              </DialogTitle>
              <DialogDescription>
                The AI made changes that may differ from what was expected.
                Review them before applying.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  The AI made changes that may differ from what was expected:
                </p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">
                  {reviewConfirmation.reviewReason}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Current Text
                  </p>
                  <div className="text-sm bg-muted/50 p-4 rounded-lg border min-h-[100px] max-h-[200px] overflow-auto whitespace-pre-wrap">
                    {reviewConfirmation.currentText}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Proposed Changes
                  </p>
                  <div className="text-sm bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 min-h-[100px] max-h-[200px] overflow-auto whitespace-pre-wrap">
                    {reviewConfirmation.proposedText}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0 bg-background">
              <Button
                variant="outline"
                onClick={() => setReviewConfirmation(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (onApplySuggestion && reviewConfirmation) {
                    onApplySuggestion(
                      reviewConfirmation.sectionKey,
                      reviewConfirmation.proposedText
                    );
                    await handleUpdateStatus(
                      reviewConfirmation.commentId,
                      "accepted"
                    );
                    toast.success("Changes applied");
                    setReviewConfirmation(null);
                  }
                }}
              >
                <Check className="size-4 mr-1" />
                Accept Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function FeedbackViewerDialog({
  open,
  onOpenChange,
  sessionId,
  shellType,
  shellId,
  onBack,
  onApplySuggestion,
  getCurrentText,
}: FeedbackViewerDialogProps) {
  const [bust, setBust] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    sessionId
  );
  const [prevPropSessionId, setPrevPropSessionId] = useState(sessionId);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      invalidateFeedbackSessionsCache(shellType, shellId);
      invalidateFeedbackSessionDetailCache();
      setBust((n) => n + 1);
      setCurrentSessionId(sessionId);
    }
  }

  if (sessionId !== prevPropSessionId) {
    setPrevPropSessionId(sessionId);
    setCurrentSessionId(sessionId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden">
        {open ? (
          <Suspense fallback={<FeedbackViewerFallback onBack={onBack} />}>
            <FeedbackViewerBody
              key={`${shellType}-${shellId}-${currentSessionId ?? "auto"}-${bust}`}
              shellType={shellType}
              shellId={shellId}
              preferredSessionId={currentSessionId}
              bust={bust}
              onBack={onBack}
              onSessionChange={setCurrentSessionId}
              onApplySuggestion={onApplySuggestion}
              getCurrentText={getCurrentText}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
