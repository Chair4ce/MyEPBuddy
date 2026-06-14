"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn, normalizeText } from "@/lib/utils";
import { 
  Loader2, 
  Check, 
  MessageSquare, 
  ArrowLeft, 
  ArrowRightLeft, 
  Trash2, 
  FileEdit, 
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

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
  suggestion_type?: "comment" | "replace" | "delete";
  replacement_text?: string;
  is_full_rewrite?: boolean;
  rewrite_text?: string;
}

interface FeedbackSession {
  id: string;
  reviewer_name: string;
  comment_count: number;
  submitted_at: string;
  pending_count: number;
}

interface ContentSnapshot {
  duty_description?: string;
  cycle_year?: string;
  sections?: Array<{
    mpa: string;
    statement_text: string;
  }>;
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
  onApplySuggestion?: (sectionKey: string, newText: string) => void;
  getCurrentText?: (sectionKey: string) => string;
}

// Apply suggestion using LLM API for intelligent text matching
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
  // Full rewrite - always safe, just replace everything
  if (comment.is_full_rewrite && comment.rewrite_text) {
    return { success: true, newText: comment.rewrite_text };
  }

  const highlightedText = comment.highlighted_text;
  const suggestionType = comment.suggestion_type;

  // No highlight info, can't apply
  if (!highlightedText || (suggestionType !== "delete" && suggestionType !== "replace")) {
    return { 
      success: false, 
      newText: currentText, 
      aborted: true,
      reason: "Missing highlight information or unsupported suggestion type" 
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
        reviewReason: result.reviewReason
      };
    } else if (result.aborted) {
      return { 
        success: false, 
        newText: currentText, 
        aborted: true, 
        reason: result.reason || "Could not apply the suggested change" 
      };
    } else {
      return { 
        success: false, 
        newText: currentText, 
        aborted: true, 
        reason: result.error || "Failed to apply suggestion" 
      };
    }
  } catch (error) {
    console.error("Error calling apply feedback API:", error);
    return { 
      success: false, 
      newText: currentText, 
      aborted: true, 
      reason: "Network error - please try again" 
    };
  }
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
  const [sessions, setSessions] = useState<FeedbackSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [contentSnapshot, setContentSnapshot] = useState<ContentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  
  // Review confirmation state - when AI makes changes beyond what was expected
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    show: boolean;
    currentText: string;
    proposedText: string;
    reviewReason: string;
    sectionKey: string;
    commentId: string;
  } | null>(null);

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
        setContentSnapshot(data.contentSnapshot || null);
        
        // Auto-expand all sections so user can review all feedback
        const allSections = new Set<string>();
        (data.comments || []).forEach((c: FeedbackComment) => {
          allSections.add(c.section_key);
        });
        setExpandedSections(allSections);
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
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update feedback");
    } finally {
      setIsUpdating(null);
    }
  }, []);

  // Get section text from snapshot (normalized to fix PDF line breaks)
  const getSectionText = useCallback((sectionKey: string): string => {
    if (!contentSnapshot) return "";
    
    let text = "";
    if (sectionKey === "duty_description") {
      text = contentSnapshot.duty_description || "";
    } else {
      const section = contentSnapshot.sections?.find(s => s.mpa === sectionKey);
      text = section?.statement_text || "";
    }
    
    return normalizeText(text);
  }, [contentSnapshot]);

  // Render text with highlight
  const renderTextWithHighlight = useCallback((
    text: string, 
    highlightStart?: number, 
    highlightEnd?: number,
    suggestionType?: string
  ) => {
    if (!text) {
      return <span className="text-muted-foreground italic">No content available</span>;
    }

    if (highlightStart === undefined || highlightEnd === undefined) {
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    const before = text.slice(0, highlightStart);
    const highlighted = text.slice(highlightStart, highlightEnd);
    const after = text.slice(highlightEnd);

    return (
      <span className="whitespace-pre-wrap">
        {before}
        <mark className={cn(
          "px-0.5 rounded",
          suggestionType === "delete" 
            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" 
            : "bg-amber-200 dark:bg-amber-900/50"
        )}>
          {highlighted}
        </mark>
        {after}
      </span>
    );
  }, []);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  // Group comments by section
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

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden">
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
                Feedback from {currentSession?.reviewer_name || "Reviewer"}
              </DialogTitle>
              {currentSession && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(currentSession.submitted_at)}
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
                      {session.reviewer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No comments found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(commentsBySection).map(([sectionKey, sectionComments]) => {
                  const sectionText = getSectionText(sectionKey);
                  const isExpanded = expandedSections.has(sectionKey);

                  return (
                    <div key={sectionKey} className="border rounded-lg overflow-hidden">
                      {/* Section header */}
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-muted/50 hover:bg-muted/70 transition-colors text-left"
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

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="p-4 space-y-4">
                          {sectionComments.map((comment, idx) => (
                            <div key={comment.id}>
                              {idx > 0 && <Separator className="my-4" />}
                              
                              <FeedbackCommentCard
                                comment={comment}
                                sectionText={sectionText}
                                currentText={getCurrentText ? getCurrentText(sectionKey) : sectionText}
                                isUpdating={isUpdating === comment.id}
                                onMarkRead={() => handleUpdateStatus(comment.id, "accepted")}
                                onIgnore={() => handleUpdateStatus(comment.id, "dismissed")}
                                onApply={onApplySuggestion ? async () => {
                                  const currentTextVal = getCurrentText ? getCurrentText(sectionKey) : sectionText;
                                  setIsUpdating(comment.id);
                                  
                                  try {
                                    const result = await applySuggestionWithLLM(sectionText, currentTextVal, comment);
                                    
                                    if (result.success) {
                                      // Check if the AI made changes that need user review
                                      if (result.needsReview) {
                                        setReviewConfirmation({
                                          show: true,
                                          currentText: currentTextVal,
                                          proposedText: result.newText,
                                          reviewReason: result.reviewReason || "The AI made changes that may differ from what was expected.",
                                          sectionKey,
                                          commentId: comment.id,
                                        });
                                      } else {
                                        onApplySuggestion(sectionKey, result.newText);
                                        await handleUpdateStatus(comment.id, "accepted");
                                        toast.success("Suggestion applied successfully");
                                      }
                                    } else if (result.aborted) {
                                      toast.error(result.reason || "Could not apply suggestion");
                                    }
                                  } catch (error) {
                                    console.error("Error applying suggestion:", error);
                                    toast.error("Failed to apply suggestion");
                                  } finally {
                                    setIsUpdating(null);
                                  }
                                } : undefined}
                                renderTextWithHighlight={renderTextWithHighlight}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Review Confirmation Dialog - shows when AI makes changes that need user approval */}
      {reviewConfirmation?.show && (
        <Dialog open={reviewConfirmation.show} onOpenChange={(open) => {
          if (!open) setReviewConfirmation(null);
        }}>
          <DialogContent className="!max-w-5xl w-[90vw] max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-5" />
                Review AI Changes
              </DialogTitle>
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
                  <p className="text-xs font-medium text-muted-foreground mb-2">Current Text</p>
                  <div className="text-sm bg-muted/50 p-4 rounded-lg border min-h-[100px] max-h-[200px] overflow-auto whitespace-pre-wrap">
                    {reviewConfirmation.currentText}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Proposed Changes</p>
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
                    onApplySuggestion(reviewConfirmation.sectionKey, reviewConfirmation.proposedText);
                    await handleUpdateStatus(reviewConfirmation.commentId, "accepted");
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
    </Dialog>
  );
}

// Collapsible statement wrapper
function CollapsibleStatement({ 
  children, 
  defaultOpen = true 
}: { 
  children: React.ReactNode; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        {isOpen ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
        <Eye className="size-3" />
        {isOpen ? "Hide statement" : "Show statement"}
      </button>
      {isOpen && children}
    </div>
  );
}

// Individual comment card component
function FeedbackCommentCard({
  comment,
  sectionText,
  currentText,
  isUpdating,
  onMarkRead,
  onIgnore,
  onApply,
  renderTextWithHighlight,
}: {
  comment: FeedbackComment;
  sectionText: string;
  currentText: string;
  isUpdating: boolean;
  onMarkRead: () => void;
  onIgnore: () => void;
  onApply?: () => void | Promise<void>;
  renderTextWithHighlight: (
    text: string, 
    start?: number, 
    end?: number, 
    type?: string
  ) => React.ReactNode;
}) {
  const isActionable = comment.suggestion_type === "replace" || 
                       comment.suggestion_type === "delete" || 
                       comment.is_full_rewrite;
  const isPending = comment.status === "pending";
  
  // Text has changed indicator
  const textHasChanged = currentText !== sectionText;

  return (
    <div className={cn("space-y-4", !isPending && "opacity-60")}>
      {/* Status indicator for already-handled comments */}
      {!isPending && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3" />
          {comment.status === "accepted" ? "Reviewed" : "Ignored"}
        </div>
      )}

      {/* Info notice if text has changed - LLM will attempt to apply intelligently */}
      {isPending && isActionable && textHasChanged && (
        <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <MessageSquare className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Text has been edited since review</p>
            <p className="text-blue-600 dark:text-blue-400">AI will attempt to apply this change intelligently. If the text cannot be found, you&apos;ll be notified.</p>
          </div>
        </div>
      )}

      {/* Suggestion type indicator */}
      {isActionable && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {comment.is_full_rewrite ? (
            <><FileEdit className="size-3" /> Suggested rewrite</>
          ) : comment.suggestion_type === "delete" ? (
            <><Trash2 className="size-3" /> Suggested deletion</>
          ) : (
            <><ArrowRightLeft className="size-3" /> Suggested replacement</>
          )}
        </div>
      )}

      {/* Full section rewrite - side by side */}
      {comment.is_full_rewrite && comment.rewrite_text ? (
        <CollapsibleStatement defaultOpen={isPending}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Eye className="size-3" /> Original Statement
              </p>
              <div className="text-sm bg-muted/50 p-3 rounded-lg border max-h-60 overflow-auto whitespace-pre-wrap">
                {sectionText || comment.original_text || "No content"}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <FileEdit className="size-3" /> Suggested Rewrite
              </p>
              <div className="text-sm bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border max-h-60 overflow-auto whitespace-pre-wrap">
                {comment.rewrite_text}
              </div>
            </div>
          </div>
        </CollapsibleStatement>
      ) : (
        /* Show the full statement with highlight - collapsible for reviewed comments */
        <CollapsibleStatement defaultOpen={isPending}>
          <div className="text-sm bg-muted/50 p-3 rounded-lg border max-h-48 overflow-auto">
            {renderTextWithHighlight(
              sectionText || comment.original_text || "",
              comment.highlight_start,
              comment.highlight_end,
              comment.suggestion_type
            )}
          </div>
        </CollapsibleStatement>
      )}

      {/* Replacement text for replace suggestions */}
      {comment.suggestion_type === "replace" && comment.replacement_text && (
        <div className="flex items-start gap-2 pl-2">
          <ArrowRight className="size-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Replace with:
            </p>
            <div className="text-sm bg-blue-50 dark:bg-blue-950/30 p-2 rounded border">
              {comment.replacement_text}
            </div>
          </div>
        </div>
      )}

      {/* Reviewer's comment */}
      {comment.comment_text && (
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Reviewer&apos;s Comment:
          </p>
          <p className="text-sm">{comment.comment_text}</p>
        </div>
      )}

      {/* Action buttons - only show for pending */}
      {isPending && (
        <div className="flex gap-2 pt-2">
          {isActionable ? (
            <>
              <Button
                size="sm"
                onClick={onApply || onMarkRead}
                disabled={isUpdating}
                className="gap-1"
              >
                {isUpdating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Accept
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onIgnore}
                disabled={isUpdating}
              >
                Ignore
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkRead}
              disabled={isUpdating}
              className="gap-1"
            >
              {isUpdating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Mark as Read
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
