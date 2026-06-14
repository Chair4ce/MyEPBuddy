"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { 
  Loader2, 
  Target, 
  Calendar, 
  Trash2, 
  ClipboardCheck, 
  Plus,
  Eye,
  EyeOff,
  ChevronRight
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Rank, Profile, ManagedMember, SupervisorExpectation, SupervisorFeedback, FeedbackType } from "@/types/database";
import { getExpectation, setExpectation, deleteExpectation } from "@/app/actions/supervisor-expectations";
import { getFeedbacksForMember } from "@/app/actions/supervisor-feedbacks";
import { FeedbackSessionDialog } from "@/components/team/feedback-session-dialog";
import { getActiveCycleYear, getActiveCycleRangeLabel, getFeedbackTypeLabel, getFeedbackTypeDescription } from "@/lib/constants";
import { CyclePeriodLabel } from "@/components/evaluation/cycle-period-label";
import { cn } from "@/lib/utils";

const FEEDBACK_TYPES: { type: FeedbackType; icon: string }[] = [
  { type: "initial", icon: "1" },
  { type: "midterm", icon: "2" },
  { type: "final", icon: "3" },
];

interface SetExpectationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Either a real subordinate profile or a managed member
  subordinate?: Profile | null;
  managedMember?: ManagedMember | null;
  onSuccess?: () => void;
}

export function SetExpectationsDialog({
  open,
  onOpenChange,
  subordinate,
  managedMember,
  onSuccess,
}: SetExpectationsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expectationText, setExpectationText] = useState("");
  const [existingExpectation, setExistingExpectation] = useState<SupervisorExpectation | null>(null);
  const [feedbacks, setFeedbacks] = useState<SupervisorFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [activeTab, setActiveTab] = useState("expectations");
  
  // Feedback dialog state
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [selectedFeedbackType, setSelectedFeedbackType] = useState<FeedbackType>("initial");
  const [selectedFeedback, setSelectedFeedback] = useState<SupervisorFeedback | null>(null);

  // Get member info
  const memberName = subordinate?.full_name || managedMember?.full_name || "Unknown";
  const memberRank = subordinate?.rank || managedMember?.rank || null;
  const subordinateId = subordinate?.id || null;
  const teamMemberId = managedMember?.id || null;

  // Get current cycle year based on subordinate's rank
  const cycleYear = getActiveCycleYear(memberRank as Rank);

  // Load data when dialog opens
  useEffect(() => {
    async function loadData() {
      if (!open) return;
      if (!subordinateId && !teamMemberId) return;

      setIsLoading(true);
      setLoadingFeedbacks(true);

      // Load expectations and feedbacks in parallel
      const [expectationResult, feedbackResult] = await Promise.all([
        getExpectation(subordinateId, teamMemberId, cycleYear),
        getFeedbacksForMember(subordinateId, teamMemberId, cycleYear),
      ]);

      if (expectationResult.data) {
        setExistingExpectation(expectationResult.data);
        setExpectationText(expectationResult.data.expectation_text);
      } else {
        setExistingExpectation(null);
        setExpectationText("");
      }

      if (feedbackResult.data) {
        setFeedbacks(feedbackResult.data);
      }

      setIsLoading(false);
      setLoadingFeedbacks(false);
    }

    loadData();
  }, [open, subordinateId, teamMemberId, cycleYear]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setExpectationText("");
      setExistingExpectation(null);
      setFeedbacks([]);
      setShowDeleteConfirm(false);
      setActiveTab("expectations");
    }
  }, [open]);

  async function handleSubmitExpectations(e: React.FormEvent) {
    e.preventDefault();

    if (!expectationText.trim()) {
      toast.error("Please enter your expectations");
      return;
    }

    setIsSubmitting(true);

    const result = await setExpectation(
      subordinateId,
      teamMemberId,
      expectationText.trim(),
      cycleYear
    );

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        existingExpectation 
          ? `Expectations updated for ${memberRank ? `${memberRank} ` : ""}${memberName}`
          : `Expectations set for ${memberRank ? `${memberRank} ` : ""}${memberName}`
      );
      setExistingExpectation({
        ...existingExpectation,
        id: result.data?.id || existingExpectation?.id || "",
        expectation_text: expectationText.trim(),
        updated_at: new Date().toISOString(),
      } as SupervisorExpectation);
      onSuccess?.();
    }

    setIsSubmitting(false);
  }

  async function handleDeleteExpectations() {
    if (!existingExpectation) return;

    setIsDeleting(true);

    const result = await deleteExpectation(existingExpectation.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Expectations removed");
      setExistingExpectation(null);
      setExpectationText("");
      onSuccess?.();
    }

    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }

  function openFeedbackDialog(type: FeedbackType, existing?: SupervisorFeedback) {
    setSelectedFeedbackType(type);
    setSelectedFeedback(existing || null);
    setShowFeedbackDialog(true);
  }

  async function handleFeedbackSuccess() {
    // Reload feedbacks
    setLoadingFeedbacks(true);
    const result = await getFeedbacksForMember(subordinateId, teamMemberId, cycleYear);
    if (result.data) {
      setFeedbacks(result.data);
    }
    setLoadingFeedbacks(false);
    onSuccess?.();
  }

  // Get feedback for each type
  function getFeedbackForType(type: FeedbackType): SupervisorFeedback | undefined {
    return feedbacks.find(f => f.feedback_type === type);
  }

  const hasExpectationChanges = expectationText.trim() !== (existingExpectation?.expectation_text || "");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-5 text-primary" />
              Expectations & Feedback
            </DialogTitle>
            <DialogDescription>
              Manage expectations and conduct feedback sessions for{" "}
              <span className="font-medium text-foreground">
                {memberRank ? `${memberRank} ` : ""}{memberName}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 pb-2">
            <Badge variant="outline" className="gap-1.5 max-w-full truncate">
              <Calendar className="size-3 shrink-0" />
              <CyclePeriodLabel rank={memberRank as import("@/types/database").Rank | null} />
            </Badge>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expectations" className="gap-2">
                <Target className="size-4" />
                <span className="hidden sm:inline">Expectations</span>
                <span className="sm:hidden">Expect.</span>
              </TabsTrigger>
              <TabsTrigger value="feedbacks" className="gap-2">
                <ClipboardCheck className="size-4" />
                <span className="hidden sm:inline">Feedback Sessions</span>
                <span className="sm:hidden">Feedback</span>
                {feedbacks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {feedbacks.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Expectations Tab */}
            <TabsContent value="expectations" className="flex-1 overflow-y-auto mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleSubmitExpectations} className="space-y-4">
                  {existingExpectation && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Last updated {new Date(existingExpectation.updated_at).toLocaleDateString()}
                      </Badge>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="expectation">
                      Your Expectations
                    </Label>
                    <Textarea
                      id="expectation"
                      value={expectationText}
                      onChange={(e) => setExpectationText(e.target.value)}
                      placeholder="Describe your expectations for this subordinate. Consider their current rank, responsibilities, and areas for growth. These expectations will help assess their accomplishments and guide their development..."
                      className="min-h-[180px] resize-none"
                      aria-label="Expectation text for subordinate"
                    />
                    <p className="text-xs text-muted-foreground">
                      Keep it concise but specific. Focus on key performance areas, goals, and behaviors you expect.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    {existingExpectation && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSubmitting || isDeleting}
                        className="text-destructive hover:text-destructive sm:mr-auto"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Remove
                      </Button>
                    )}
                    <div className="flex gap-2 sm:ml-auto">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                      >
                        Close
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting || !expectationText.trim() || !hasExpectationChanges}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : existingExpectation ? (
                          "Update"
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </TabsContent>

            {/* Feedbacks Tab */}
            <TabsContent value="feedbacks" className="flex-1 overflow-y-auto mt-4">
              {loadingFeedbacks ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Conduct feedback sessions throughout the evaluation cycle. Each session builds on the previous one.
                  </p>
                  
                  <Separator className="my-4" />

                  {FEEDBACK_TYPES.map(({ type, icon }) => {
                    const feedback = getFeedbackForType(type);
                    const isShared = feedback?.status === "shared";
                    
                    return (
                      <Card 
                        key={type}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 transition-colors",
                          feedback && "border-l-2",
                          feedback && isShared && "border-l-green-500",
                          feedback && !isShared && "border-l-amber-500"
                        )}
                        onClick={() => openFeedbackDialog(type, feedback)}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "size-8 rounded-full flex items-center justify-center text-sm font-semibold",
                                feedback 
                                  ? isShared 
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {icon}
                              </div>
                              <div>
                                <CardTitle className="text-sm font-medium">
                                  {getFeedbackTypeLabel(type)}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  {getFeedbackTypeDescription(type)}
                                </CardDescription>
                              </div>
                            </div>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        {feedback && (
                          <CardContent className="p-4 pt-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge 
                                variant={isShared ? "default" : "secondary"} 
                                className={cn(
                                  "text-xs gap-1",
                                  isShared && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                )}
                              >
                                {isShared ? (
                                  <><Eye className="size-3" /> Shared</>
                                ) : (
                                  <><EyeOff className="size-3" /> Draft</>
                                )}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Updated {new Date(feedback.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                            {feedback.content && (
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                {feedback.content}
                              </p>
                            )}
                          </CardContent>
                        )}
                        {!feedback && (
                          <CardContent className="p-4 pt-0">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Plus className="size-4" />
                              <span className="text-xs">Click to create</span>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  <div className="pt-4">
                    <Button
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      className="w-full"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Expectation Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Expectations?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the expectations you&apos;ve set for{" "}
              {memberRank ? `${memberRank} ` : ""}{memberName} for{" "}
              {getActiveCycleRangeLabel(memberRank as import("@/types/database").Rank | null)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpectations}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                "Remove Expectations"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feedback Session Dialog */}
      <FeedbackSessionDialog
        open={showFeedbackDialog}
        onOpenChange={setShowFeedbackDialog}
        feedbackType={selectedFeedbackType}
        existingFeedback={selectedFeedback}
        subordinate={subordinate}
        managedMember={managedMember}
        onSuccess={handleFeedbackSuccess}
      />
    </>
  );
}
