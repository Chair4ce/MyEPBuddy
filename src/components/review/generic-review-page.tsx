"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { Loader2, Send, AlertCircle, CheckCircle2, FileEdit } from "lucide-react";
import { ReviewerNameInput } from "@/components/review/reviewer-name-input";
import { ReviewSection } from "@/components/review/review-section";
import { CommentSidebar } from "@/components/review/comment-sidebar";
import { SectionRewriteEditor } from "@/components/review/section-rewrite-editor";
import type { CommentData } from "@/components/review/comment-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Section {
  key: string;
  label: string;
  content: string;
}

interface ReviewData {
  shellType: string;
  shellId: string;
  rateeName: string;
  rateeRank?: string;
  linkLabel?: string | null;
  isAnonymous: boolean;
  title?: string;
  cycleYear?: number;
  dutyDescription?: string;
  sections: Section[] | null;
}

type ReviewStep = "loading" | "error" | "name" | "review" | "submitting" | "success";

interface GenericReviewPageProps {
  token: string;
  shellType: "epb" | "award" | "decoration";
  shellTypeLabel: string;
}

// LocalStorage key for persisting review progress
const getStorageKey = (token: string) => `review_progress_${token}`;

interface StoredProgress {
  reviewerName: string;
  reviewerNameSource: "label" | "provided" | "generated";
  comments: CommentData[];
  step: ReviewStep;
}

export function GenericReviewPage({ token, shellType, shellTypeLabel }: GenericReviewPageProps) {
  const [step, setStep] = useState<ReviewStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNameSource, setReviewerNameSource] = useState<"label" | "provided" | "generated">("provided");
  const [comments, setComments] = useState<CommentData[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [hasRestoredProgress, setHasRestoredProgress] = useState(false);
  const [rewriteEditorSection, setRewriteEditorSection] = useState<{
    key: string;
    label: string;
    content: string;
  } | null>(null);

  // Load review data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch(`/api/review/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Failed to load review data");
          setStep("error");
          return;
        }

        // Normalize sections format
        const normalizedSections: Section[] = [];
        
        if (data.shellType === "epb" && data.sections) {
          // EPB has mpa/statement_text format
          for (const section of data.sections) {
            normalizedSections.push({
              key: section.mpa,
              label: {
                executing_mission: "Executing the Mission",
                leading_people: "Leading People",
                managing_resources: "Managing Resources",
                improving_unit: "Improving the Unit",
                hlr_assessment: "HLR Assessment",
              }[section.mpa as string] || section.mpa,
              content: section.statement_text || "",
            });
          }
        } else if (data.sections) {
          // Award/Decoration have key/label/content format
          for (const section of data.sections) {
            normalizedSections.push({
              key: section.key,
              label: section.label,
              content: section.content || "",
            });
          }
        }

        setReviewData({
          ...data,
          sections: normalizedSections,
        });

        // Try to restore saved progress from localStorage
        try {
          const savedProgress = localStorage.getItem(getStorageKey(token));
          if (savedProgress) {
            const progress: StoredProgress = JSON.parse(savedProgress);
            if (progress.reviewerName) {
              setReviewerName(progress.reviewerName);
              setReviewerNameSource(progress.reviewerNameSource);
            }
            if (progress.comments && progress.comments.length > 0) {
              setComments(progress.comments);
            }
            // If we have a name and were in review step, go directly to review
            if (progress.reviewerName && progress.step === "review") {
              setStep("review");
              setHasRestoredProgress(true);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to restore review progress:", e);
        }

        setStep("name");
      } catch (err) {
        console.error("Load error:", err);
        setError("Failed to load review data");
        setStep("error");
      }
    }

    loadData();
  }, [token]);

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    if (step === "review" || step === "name") {
      try {
        const progress: StoredProgress = {
          reviewerName,
          reviewerNameSource,
          comments,
          step,
        };
        localStorage.setItem(getStorageKey(token), JSON.stringify(progress));
      } catch (e) {
        console.warn("Failed to save review progress:", e);
      }
    }
  }, [token, reviewerName, reviewerNameSource, comments, step]);

  // Clear localStorage on successful submit
  const clearSavedProgress = useCallback(() => {
    try {
      localStorage.removeItem(getStorageKey(token));
    } catch (e) {
      console.warn("Failed to clear saved progress:", e);
    }
  }, [token]);

  // Handle name submission
  const handleNameSubmit = useCallback((name: string, source: "label" | "provided" | "generated") => {
    setReviewerName(name);
    setReviewerNameSource(source);
    setStep("review");
  }, []);

  // Add a comment
  const handleAddComment = useCallback((comment: Omit<CommentData, "id">) => {
    const id = crypto.randomUUID();
    setComments((prev) => [...prev, { ...comment, id }]);
    setActiveCommentId(id);
  }, []);

  // Update a comment
  const handleUpdateComment = useCallback((id: string, updates: { commentText?: string; replacementText?: string; rewriteText?: string }) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  // Delete a comment
  const handleDeleteComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    if (activeCommentId === id) {
      setActiveCommentId(null);
    }
  }, [activeCommentId]);

  // Add general comment
  const handleAddGeneralComment = useCallback(() => {
    const id = crypto.randomUUID();
    setComments((prev) => [
      ...prev,
      {
        id,
        sectionKey: "general",
        sectionLabel: "General",
        commentText: "",
      },
    ]);
    setActiveCommentId(id);
    setEditingCommentId(id);
  }, []);

  // Handle section rewrite save
  const handleSaveRewrite = useCallback((sectionKey: string, sectionLabel: string, rewriteText: string) => {
    // Check if there's already a rewrite for this section
    const existingRewriteIndex = comments.findIndex(
      (c) => c.sectionKey === sectionKey && c.isFullRewrite
    );

    if (existingRewriteIndex >= 0) {
      // Update existing rewrite
      setComments((prev) =>
        prev.map((c, i) =>
          i === existingRewriteIndex ? { ...c, rewriteText, commentText: "Suggested rewrite for this section" } : c
        )
      );
    } else {
      // Add new rewrite comment
      const id = crypto.randomUUID();
      setComments((prev) => [
        ...prev,
        {
          id,
          sectionKey,
          sectionLabel,
          commentText: "Suggested rewrite for this section",
          isFullRewrite: true,
          rewriteText,
        },
      ]);
    }
    setRewriteEditorSection(null);
  }, [comments]);

  // Get existing rewrite for a section
  const getExistingRewrite = useCallback((sectionKey: string) => {
    const rewrite = comments.find((c) => c.sectionKey === sectionKey && c.isFullRewrite);
    return rewrite?.rewriteText;
  }, [comments]);

  // Submit feedback
  const handleSubmit = useCallback(async () => {
    if (comments.length === 0) {
      toast.error("Please add at least one comment before submitting");
      return;
    }

    // Check for empty comments
    const emptyComments = comments.filter((c) => !c.commentText.trim());
    if (emptyComments.length > 0) {
      toast.error("Please fill in all comments before submitting");
      return;
    }

    setShowSubmitDialog(false);
    setStep("submitting");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reviewerName,
          reviewerNameSource,
          comments: comments.map((c) => ({
            sectionKey: c.sectionKey,
            sectionLabel: c.sectionLabel,
            originalText: c.originalText,
            highlightStart: c.highlightStart,
            highlightEnd: c.highlightEnd,
            highlightedText: c.highlightedText,
            commentText: c.commentText,
            suggestion: c.suggestion,
            suggestionType: c.suggestionType,
            replacementText: c.replacementText,
            isFullRewrite: c.isFullRewrite,
            rewriteText: c.rewriteText,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      // Clear saved progress on successful submit
      clearSavedProgress();
      setStep("success");
    } catch (err) {
      console.error("Submit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback");
      setStep("review");
    }
  }, [token, reviewerName, reviewerNameSource, comments, clearSavedProgress]);

  // Loading state
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="size-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading review...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <CardTitle>Unable to Load Review</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              This link may have expired or already been used. Please contact the author for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
              <CheckCircle2 className="size-6 text-green-600" />
            </div>
            <CardTitle>Thank You for Your Feedback!</CardTitle>
            <CardDescription>
              Your comments have been submitted successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewData?.rateeRank} {reviewData?.rateeName} will be notified and can review your feedback.
            </p>
            <p className="text-xs text-muted-foreground">
              {reviewData?.isAnonymous 
                ? "You can close this page."
                : "This review link has been deactivated. You can close this page."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitting state
  if (step === "submitting") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="size-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Submitting your feedback...</p>
        </div>
      </div>
    );
  }

  // Name input step
  if (step === "name" && reviewData) {
    return (
      <ReviewerNameInput
        rateeName={reviewData.rateeName}
        rateeRank={reviewData.rateeRank}
        cycleYear={reviewData.cycleYear}
        linkLabel={reviewData.linkLabel}
        isAnonymous={reviewData.isAnonymous}
        onContinue={handleNameSubmit}
      />
    );
  }

  // Review step
  if (step === "review" && reviewData) {
    const title = reviewData.title || `${shellTypeLabel} for ${reviewData.rateeRank || ""} ${reviewData.rateeName}`.trim();
    
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b bg-background px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="font-semibold">
                {shellTypeLabel} Review: {title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {reviewData.rateeRank} {reviewData.rateeName}
                {reviewData.cycleYear && ` • ${reviewData.cycleYear}`}
                {" • Reviewing as: "}{reviewerName}
              </p>
            </div>
            <Button
              onClick={() => setShowSubmitDialog(true)}
              disabled={comments.length === 0}
              className="gap-2"
            >
              <Send className="size-4" />
              Submit Feedback
            </Button>
          </div>
        </header>

        {/* Instructions */}
        <div className="shrink-0 border-b bg-muted/30 px-4 py-2">
          <p className="text-sm text-muted-foreground text-center">
            Select text in any section to add a comment. Click Submit when you&apos;re done reviewing.
          </p>
        </div>

        {/* Main content */}
        <div className="flex-1 flex min-h-0">
          {/* Document area */}
          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full">
              <div className="max-w-5xl mx-auto p-6 space-y-4">
                {/* Duty Description for EPB */}
                {reviewData.dutyDescription && (
                  <ReviewSection
                    sectionKey="duty_description"
                    sectionLabel="Duty Description"
                    content={reviewData.dutyDescription}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    hoveredCommentId={hoveredCommentId}
                    isEditable={true}
                    hasRewrite={!!getExistingRewrite("duty_description")}
                    onAddComment={handleAddComment}
                    onCommentClick={setActiveCommentId}
                    onCommentHover={setHoveredCommentId}
                    onSuggestRewrite={() => setRewriteEditorSection({
                      key: "duty_description",
                      label: "Duty Description",
                      content: reviewData.dutyDescription || "",
                    })}
                  />
                )}

                {/* Sections */}
                {reviewData.sections?.map((section) => (
                  <ReviewSection
                    key={section.key}
                    sectionKey={section.key}
                    sectionLabel={section.label}
                    content={section.content || ""}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    hoveredCommentId={hoveredCommentId}
                    isEditable={true}
                    hasRewrite={!!getExistingRewrite(section.key)}
                    onAddComment={handleAddComment}
                    onCommentClick={setActiveCommentId}
                    onCommentHover={setHoveredCommentId}
                    onSuggestRewrite={() => setRewriteEditorSection({
                      key: section.key,
                      label: section.label,
                      content: section.content || "",
                    })}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Comment sidebar */}
          <div className="w-80 shrink-0 hidden lg:block h-full overflow-hidden">
            <CommentSidebar
              comments={comments}
              isEditable={true}
              activeCommentId={activeCommentId}
              hoveredCommentId={hoveredCommentId}
              editingCommentId={editingCommentId}
              onCommentUpdate={(id, updates) => {
                handleUpdateComment(id, updates);
                setEditingCommentId(null);
              }}
              onCommentDelete={handleDeleteComment}
              onCommentClick={setActiveCommentId}
              onCommentHover={setHoveredCommentId}
              onAddGeneralComment={handleAddGeneralComment}
              title={`Comments (${comments.length})`}
              emptyMessage="Select text to add a comment"
            />
          </div>
        </div>

        {/* Mobile comment count */}
        <div className="lg:hidden shrink-0 border-t bg-background px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {comments.length} comment{comments.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddGeneralComment}
            >
              Add General Comment
            </Button>
          </div>
        </div>

        {/* Submit confirmation dialog */}
        <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Feedback?</DialogTitle>
              <DialogDescription>
                You&apos;re about to submit {comments.length} comment{comments.length !== 1 ? "s" : ""} for this {shellTypeLabel.toLowerCase()}.
                {!reviewData.isAnonymous && " Once submitted, you won't be able to add more comments to this review."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                Submit Feedback
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Section rewrite editor */}
        {rewriteEditorSection && (
          <SectionRewriteEditor
            open={true}
            onOpenChange={(open) => !open && setRewriteEditorSection(null)}
            sectionKey={rewriteEditorSection.key}
            sectionLabel={rewriteEditorSection.label}
            originalText={rewriteEditorSection.content}
            existingRewrite={getExistingRewrite(rewriteEditorSection.key)}
            onSave={(rewriteText) => handleSaveRewrite(
              rewriteEditorSection.key,
              rewriteEditorSection.label,
              rewriteText
            )}
          />
        )}
      </div>
    );
  }

  return null;
}
