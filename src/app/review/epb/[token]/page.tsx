"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { Loader2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { ReviewerNameInput } from "@/components/review/reviewer-name-input";
import { ReviewSection } from "@/components/review/review-section";
import { CommentSidebar, } from "@/components/review/comment-sidebar";
import type { CommentData } from "@/components/review/comment-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

interface EPBData {
  shellType: string;
  shellId: string;
  rateeName: string;
  rateeRank?: string;
  linkLabel?: string | null;
  isAnonymous: boolean;
  cycleYear?: number;
  dutyDescription?: string;
  sections: Array<{
    mpa: string;
    statement_text: string;
  }>;
}

type ReviewStep = "loading" | "error" | "name" | "review" | "submitting" | "success";

export default function EPBReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();
  
  const [step, setStep] = useState<ReviewStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const [epbData, setEpbData] = useState<EPBData | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNameSource, setReviewerNameSource] = useState<"label" | "provided" | "generated">("provided");
  const [comments, setComments] = useState<CommentData[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Load EPB data
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

        setEpbData(data);
        setStep("name");
      } catch (err) {
        console.error("Load error:", err);
        setError("Failed to load review data");
        setStep("error");
      }
    }

    loadData();
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
  const handleUpdateComment = useCallback((id: string, commentText: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, commentText } : c))
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
  }, []);

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
            section_key: c.sectionKey,
            original_text: c.originalText,
            highlight_start: c.highlightStart,
            highlight_end: c.highlightEnd,
            highlighted_text: c.highlightedText,
            comment_text: c.commentText,
            suggestion: c.suggestion,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      setStep("success");
    } catch (err) {
      console.error("Submit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback");
      setStep("review");
    }
  }, [token, reviewerName, reviewerNameSource, comments]);

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
              This link may have expired or already been used. Please contact the EPB author for a new link.
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
              {epbData?.rateeRank} {epbData?.rateeName} will be notified and can review your feedback.
            </p>
            <p className="text-xs text-muted-foreground">
              This review link has been deactivated. You can close this page.
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
  if (step === "name" && epbData) {
    return (
      <ReviewerNameInput
        rateeName={epbData.rateeName}
        rateeRank={epbData.rateeRank}
        cycleYear={epbData.cycleYear}
        linkLabel={epbData.linkLabel}
        isAnonymous={epbData.isAnonymous}
        onContinue={handleNameSubmit}
      />
    );
  }

  // Review step
  if (step === "review" && epbData) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="shrink-0 border-b bg-background px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="font-semibold">
                EPB Review for {epbData.rateeRank} {epbData.rateeName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Cycle {epbData.cycleYear} • Reviewing as: {reviewerName}
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
              <div className="max-w-3xl mx-auto p-6 space-y-4">
                {/* Duty Description */}
                {epbData.dutyDescription && (
                  <ReviewSection
                    sectionKey="duty_description"
                    sectionLabel="Duty Description"
                    content={epbData.dutyDescription}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    isEditable={true}
                    onAddComment={handleAddComment}
                    onCommentClick={setActiveCommentId}
                  />
                )}

                {/* MPA Sections */}
                {epbData.sections?.map((section) => (
                  <ReviewSection
                    key={section.mpa}
                    sectionKey={section.mpa}
                    sectionLabel={MPA_LABELS[section.mpa] || section.mpa}
                    content={section.statement_text || ""}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    isEditable={true}
                    onAddComment={handleAddComment}
                    onCommentClick={setActiveCommentId}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Comment sidebar */}
          <div className="w-80 shrink-0 hidden lg:block">
            <CommentSidebar
              comments={comments.map((c) => ({
                ...c,
                sectionLabel: MPA_LABELS[c.sectionKey] || c.sectionKey,
              }))}
              isEditable={true}
              activeCommentId={activeCommentId}
              onCommentUpdate={handleUpdateComment}
              onCommentDelete={handleDeleteComment}
              onCommentClick={setActiveCommentId}
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
                You&apos;re about to submit {comments.length} comment{comments.length !== 1 ? "s" : ""} for this EPB.
                Once submitted, you won&apos;t be able to add more comments to this review.
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
      </div>
    );
  }

  return null;
}
