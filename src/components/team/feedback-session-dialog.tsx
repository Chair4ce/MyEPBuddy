"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { 
  Loader2, 
  Calendar, 
  Trash2, 
  Share2, 
  Copy, 
  Printer,
  Check,
  FileText,
  MoreHorizontal,
  EyeOff,
  Eye,
  ClipboardCheck,
  Sparkles,
} from "lucide-react";
import type { Rank, Profile, ManagedMember, SupervisorFeedback, FeedbackType } from "@/types/database";
import {
  saveFeedback, 
  shareFeedback, 
  unshareFeedback,
  deleteFeedback 
} from "@/app/actions/supervisor-feedbacks";
import { getActiveCycleYear, getActiveCycleRangeLabel, getFeedbackTypeLabel, getFeedbackTypeDescription } from "@/lib/constants";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import { cn } from "@/lib/utils";
import {
  GENERATE_BUTTON_LABELS,
  GENERATE_HELPER_TEXT,
  getGenerateAriaLabel,
} from "./feedback-session-generate";
import { useFeedbackTalkingPointsGenerate } from "./use-feedback-talking-points-generate";

interface FeedbackSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedbackType: FeedbackType;
  existingFeedback?: SupervisorFeedback | null;
  // Either a real subordinate profile or a managed member
  subordinate?: Profile | null;
  managedMember?: ManagedMember | null;
  onSuccess?: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function FeedbackSessionDialog({
  open,
  onOpenChange,
  feedbackType,
  existingFeedback,
  subordinate,
  managedMember,
  onSuccess,
}: FeedbackSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <FeedbackSessionDialogInner
          key={existingFeedback?.id ?? `new-${feedbackType}`}
          onOpenChange={onOpenChange}
          feedbackType={feedbackType}
          existingFeedback={existingFeedback}
          subordinate={subordinate}
          managedMember={managedMember}
          onSuccess={onSuccess}
        />
      ) : null}
    </Dialog>
  );
}

function FeedbackSessionDialogInner({
  onOpenChange,
  feedbackType,
  existingFeedback,
  subordinate,
  managedMember,
  onSuccess,
}: Omit<FeedbackSessionDialogProps, "open">) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [content, setContent] = useState(existingFeedback?.content ?? "");
  const [feedback, setFeedback] = useState<SupervisorFeedback | null>(
    existingFeedback ?? null
  );
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const reviewedAccomplishmentIdsRef = useRef<string[]>(
    existingFeedback?.reviewed_accomplishment_ids ?? []
  );

  // Get member info
  const memberName = subordinate?.full_name || managedMember?.full_name || "Unknown";
  const memberRank = subordinate?.rank || managedMember?.rank || null;
  const subordinateId = subordinate?.id || null;
  const teamMemberId = managedMember?.id || null;

  // Get current cycle year based on subordinate's rank
  const cycleYear = getActiveCycleYear(memberRank as Rank);
  const cyclePeriodLabel = getActiveCycleRangeLabel(memberRank as Rank);
  const isShared = feedback?.status === "shared";

  const { isGenerating, handleGenerateClick, executeGenerate } =
    useFeedbackTalkingPointsGenerate({
      feedbackType,
      subordinateId,
      teamMemberId,
      cycleYear,
      content,
      isShared,
      feedback,
      setContent,
      setFeedback,
      reviewedAccomplishmentIdsRef,
      setShowReplaceConfirm,
    });

  async function handleSave() {
    if (!content.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    setIsSaving(true);

    const reviewedIds =
      reviewedAccomplishmentIdsRef.current.length > 0
        ? reviewedAccomplishmentIdsRef.current
        : feedback?.reviewed_accomplishment_ids || [];

    const result = await saveFeedback(
      subordinateId,
      teamMemberId,
      feedbackType,
      cycleYear,
      content.trim(),
      reviewedIds
    );

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(feedback ? "Feedback updated" : "Feedback saved as draft");
      // Update local state with new ID
      if (result.data?.id && !feedback) {
        setFeedback({
          id: result.data.id,
          supervisor_id: "",
          subordinate_id: subordinateId,
          team_member_id: teamMemberId,
          feedback_type: feedbackType,
          cycle_year: cycleYear,
          content: content.trim(),
          reviewed_accomplishment_ids: reviewedIds,
          status: "draft",
          shared_at: null,
          supervision_start_date: "",
          supervision_end_date: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (feedback) {
        setFeedback({
          ...feedback,
          content: content.trim(),
          reviewed_accomplishment_ids: reviewedIds,
        });
      }
      onSuccess?.();
    }

    setIsSaving(false);
  }

  async function handleShare() {
    if (!feedback?.id) {
      // Save first if not saved
      await handleSave();
      return;
    }

    setIsSharing(true);

    const result = await shareFeedback(feedback.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Feedback shared with ${memberRank ? `${memberRank} ` : ""}${memberName}`);
      setFeedback({ ...feedback, status: "shared", shared_at: new Date().toISOString() });
      onSuccess?.();
    }

    setIsSharing(false);
    setShowShareConfirm(false);
  }

  async function handleUnshare() {
    if (!feedback?.id) return;

    setIsSharing(true);

    const result = await unshareFeedback(feedback.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Feedback reverted to draft");
      setFeedback({ ...feedback, status: "draft", shared_at: null });
      onSuccess?.();
    }

    setIsSharing(false);
  }

  async function handleDelete() {
    if (!feedback?.id) return;

    setIsDeleting(true);

    const result = await deleteFeedback(feedback.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Feedback deleted");
      onSuccess?.();
      onOpenChange(false);
    }

    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }

  function handleCopy() {
    const textToCopy = formatFeedbackForExport();
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      toast.success("Feedback copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  }

  function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${getFeedbackTypeLabel(feedbackType)} - ${memberRank ? `${memberRank} ` : ""}${memberName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 18px; margin-bottom: 8px; }
            h2 { font-size: 14px; color: #666; margin-bottom: 24px; font-weight: normal; }
            .meta { font-size: 12px; color: #888; margin-bottom: 16px; }
            .content { white-space: pre-wrap; line-height: 1.6; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>${getFeedbackTypeLabel(feedbackType)}</h1>
          <h2>${memberRank ? `${memberRank} ` : ""}${memberName}</h2>
          <div class="meta">Evaluation Period: ${cyclePeriodLabel} | Date: ${new Date().toLocaleDateString("en-US", { timeZone: "UTC" })}</div>
          <div class="content">${escapeHtml(content).replace(/\n/g, "<br>")}</div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  function formatFeedbackForExport(): string {
    return `${getFeedbackTypeLabel(feedbackType)}
${memberRank ? `${memberRank} ` : ""}${memberName}
Evaluation Period: ${cyclePeriodLabel}
Date: ${new Date().toLocaleDateString("en-US", { timeZone: "UTC" })}

${content}`;
  }

  const hasChanges = content.trim() !== (feedback?.content || "");
  const canGenerate = !isShared && (!!subordinateId || !!teamMemberId);

  return (
    <>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              {getFeedbackTypeLabel(feedbackType)}
            </DialogTitle>
            <DialogDescription>
              {getFeedbackTypeDescription(feedbackType)} for{" "}
              <span className="font-medium text-foreground">
                {memberRank ? `${memberRank} ` : ""}{memberName}
              </span>
            </DialogDescription>
          </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              {/* Status and Metadata */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Calendar className="size-3" />
                  Cycle {cycleYear}
                </Badge>
                {feedback && (
                  <>
                    <Badge 
                      variant={isShared ? "default" : "secondary"} 
                      className={cn(
                        "gap-1.5",
                        isShared && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      )}
                    >
                      {isShared ? (
                        <>
                          <Eye className="size-3" />
                          Shared
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3" />
                          Draft
                        </>
                      )}
                    </Badge>
                    {isShared && feedback.shared_at && (
                      <span className="text-xs text-muted-foreground">
                        Shared {new Date(feedback.shared_at).toLocaleDateString("en-US", { timeZone: "UTC" })}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Feedback Content */}
              <div className="space-y-2" ref={printRef}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <Label htmlFor="feedback-content" className="flex items-center gap-2 shrink-0">
                    <FileText className="size-4" />
                    Feedback Content
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateClick}
                    disabled={!canGenerate || isGenerating}
                    className="h-auto min-h-8 w-full sm:w-auto max-w-full whitespace-normal text-left text-xs py-1.5"
                    aria-label={getGenerateAriaLabel(feedbackType, memberName)}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5 shrink-0" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 mr-1.5 shrink-0" />
                        <span className="min-w-0">{GENERATE_BUTTON_LABELS[feedbackType]}</span>
                      </>
                    )}
                    <TokenCostBadge compact className="ml-1.5 shrink-0" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {GENERATE_HELPER_TEXT[feedbackType]}
                </p>
                <Textarea
                  id="feedback-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Enter your ${getFeedbackTypeLabel(feedbackType).toLowerCase()} for this Airman. Include performance observations, areas of strength, and developmental recommendations...`}
                  className="min-h-[250px] resize-none"
                  disabled={isShared}
                  aria-label="Feedback content"
                />
                {isShared && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This feedback has been shared and cannot be edited. Unshare to make changes.
                  </p>
                )}
              </div>
            </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
            <div className="flex items-center gap-2 sm:mr-auto">
              {/* Delete - only for drafts */}
              {feedback && !isShared && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving || isDeleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              
              {/* Export options */}
              {content.trim() && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleCopy}>
                      {copied ? (
                        <Check className="size-4 mr-2 text-green-600" />
                      ) : (
                        <Copy className="size-4 mr-2" />
                      )}
                      Copy to Clipboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrint}>
                      <Printer className="size-4 mr-2" />
                      Print
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="flex-1 sm:flex-none"
              >
                {hasChanges ? "Discard" : "Close"}
              </Button>
              
              {/* Unshare button - only for shared feedbacks */}
              {isShared && (
                <Button
                  variant="outline"
                  onClick={handleUnshare}
                  disabled={isSharing}
                  className="flex-1 sm:flex-none"
                >
                  {isSharing ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <EyeOff className="size-4 mr-2" />
                  )}
                  Unshare
                </Button>
              )}

              {/* Save button - only for drafts */}
              {!isShared && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !content.trim() || !hasChanges}
                  className="flex-1 sm:flex-none"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save Draft"
                  )}
                </Button>
              )}

              {/* Share button - only for drafts with content */}
              {!isShared && content.trim() && (
                <Button
                  onClick={() => {
                    if (hasChanges) {
                      // Save first, then show share confirm
                      handleSave().then(() => setShowShareConfirm(true));
                    } else {
                      setShowShareConfirm(true);
                    }
                  }}
                  disabled={isSaving || isSharing}
                  variant="default"
                  className="flex-1 sm:flex-none gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Share2 className="size-4" />
                  Share
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>

      {/* Share Confirmation */}
      <AlertDialog open={showShareConfirm} onOpenChange={setShowShareConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Share2 className="size-5 text-green-600" />
              Share Feedback?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will share the {getFeedbackTypeLabel(feedbackType).toLowerCase()} with{" "}
              <span className="font-medium">{memberRank ? `${memberRank} ` : ""}{memberName}</span>.
              They will be able to view this feedback. You can unshare it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSharing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleShare}
              disabled={isSharing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSharing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="size-4 mr-2" />
                  Share Feedback
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace Draft Confirmation */}
      <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Replace current draft with generated talking points? Undo is not available after replace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGenerating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void executeGenerate()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                "Replace draft"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {getFeedbackTypeLabel(feedbackType).toLowerCase()} draft.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Feedback"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
