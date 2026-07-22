"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
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
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import type {
  FeedbackType,
  ManagedMember,
  Profile,
  Rank,
  SupervisorFeedback,
} from "@/types/database";
import {
  deleteFeedback,
  saveFeedback,
  shareFeedback,
  unshareFeedback,
  type FeedbackEpbStatementItem,
  type FeedbackEvidenceItem,
} from "@/app/actions/supervisor-feedbacks";
import { setExpectation } from "@/app/actions/supervisor-expectations";
import {
  getDefaultFeedbackSessionGuide,
  getFeedbackGuideFormLabel,
} from "@/lib/feedback-session-guide-templates";
import { looksLikePackageReviewGuide } from "@/lib/feedback-session-guide-revise";
import { getFeedbackTypeLabel } from "@/lib/constants";
import { FeedbackAcaStrengthsWeaknesses } from "@/components/team/feedback-aca-strengths-weaknesses";
import { FeedbackEpbPackagePanel } from "@/components/team/feedback-epb-package-panel";
import { cn } from "@/lib/utils";
import { billableFetch } from "@/lib/fetch-with-retry";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeLegacyChecklistInContent(content: string): boolean {
  return content.includes("Form-prep settings only");
}

/** Post-remigration local guide text for Midterm/Final (empty when checklist migrates out of content). */
function resolveInitialEvidenceGuideContent(
  existingFeedback: SupervisorFeedback | null
): string {
  const savedSettings = existingFeedback?.session_settings?.trim();
  const raw = existingFeedback?.content?.trim() || "";
  if (!savedSettings && raw && looksLikeLegacyChecklistInContent(raw)) {
    return "";
  }
  return raw;
}

export type SessionGuideDraft = {
  sessionSettings: string;
  content: string;
  activePane: "settings" | "guide";
};

interface SessionGuidePhaseEditorProps {
  feedbackType: FeedbackType;
  subordinate?: Profile | null;
  managedMember?: ManagedMember | null;
  cycleYear: number;
  existingFeedback: SupervisorFeedback | null;
  evidenceItems?: FeedbackEvidenceItem[];
  evidenceTruncated?: boolean;
  evidenceError?: string | null;
  isLoadingEvidence?: boolean;
  onRefreshEvidence?: () => void;
  epbItems?: FeedbackEpbStatementItem[];
  epbError?: string | null;
  isLoadingEpb?: boolean;
  onRefreshEpb?: () => void;
  draftSnapshot?: SessionGuideDraft | null;
  onDraftChange?: (draft: SessionGuideDraft) => void;
  onFeedbackChange: (feedback: SupervisorFeedback | null) => void;
  onSaved?: () => void;
}

export function SessionGuidePhaseEditor({
  feedbackType,
  subordinate,
  managedMember,
  cycleYear,
  existingFeedback,
  evidenceItems = [],
  evidenceTruncated = false,
  evidenceError = null,
  isLoadingEvidence = false,
  onRefreshEvidence,
  epbItems = [],
  epbError = null,
  isLoadingEpb = false,
  onRefreshEpb,
  draftSnapshot,
  onDraftChange,
  onFeedbackChange,
  onSaved,
}: SessionGuidePhaseEditorProps) {
  const memberName =
    subordinate?.full_name || managedMember?.full_name || "Unknown";
  const memberRank = (subordinate?.rank || managedMember?.rank || null) as Rank | null;
  const subordinateId = subordinate?.id || null;
  const teamMemberId = managedMember?.id || null;
  const canShare = !!subordinateId;
  const formLabel = getFeedbackGuideFormLabel(memberRank);
  const defaultTemplate = getDefaultFeedbackSessionGuide(feedbackType, memberRank);
  const isEvidencePhase =
    feedbackType === "midterm" || feedbackType === "final";
  const isFinalPhase = feedbackType === "final";
  const isMidtermPhase = feedbackType === "midterm";

  const [sessionSettings, setSessionSettings] = useState(() => {
    if (draftSnapshot) return draftSnapshot.sessionSettings;
    if (!isEvidencePhase) return "";
    const saved = existingFeedback?.session_settings?.trim();
    if (saved) return existingFeedback!.session_settings;
    // Migrated checklist may still sit in content until Generate runs
    const content = existingFeedback?.content?.trim() || "";
    if (content && looksLikeLegacyChecklistInContent(content)) {
      return existingFeedback!.content;
    }
    return defaultTemplate;
  });

  const [content, setContent] = useState(() => {
    if (draftSnapshot) return draftSnapshot.content;
    if (!isEvidencePhase) {
      return existingFeedback?.content?.trim() || defaultTemplate;
    }
    return resolveInitialEvidenceGuideContent(existingFeedback);
  });

  const [feedback, setFeedback] = useState<SupervisorFeedback | null>(
    existingFeedback
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const [activePane, setActivePane] = useState<"settings" | "guide">(() => {
    if (draftSnapshot) return draftSnapshot.activePane;
    if (!isEvidencePhase) return "settings";
    // Use post-remigration local guide, not raw DB content (checklist may
    // still live in content column after settings migration).
    const localGuide = resolveInitialEvidenceGuideContent(existingFeedback);
    return localGuide.trim() ? "guide" : "settings";
  });
  const [strengthsOpen, setStrengthsOpen] = useState(false);

  const reviseRequestIdRef = useRef(0);
  const generateRequestIdRef = useRef(0);
  const printRef = useRef<HTMLDivElement>(null);

  function publishDraft(
    next: Partial<SessionGuideDraft> & {
      sessionSettings?: string;
      content?: string;
      activePane?: "settings" | "guide";
    }
  ) {
    onDraftChange?.({
      sessionSettings: next.sessionSettings ?? sessionSettings,
      content: next.content ?? content,
      activePane: next.activePane ?? activePane,
    });
  }

  function updateSessionSettings(value: string) {
    setSessionSettings(value);
    publishDraft({ sessionSettings: value });
  }

  function updateContent(value: string) {
    setContent(value);
    publishDraft({ content: value });
  }

  function updateActivePane(value: "settings" | "guide") {
    setActivePane(value);
    publishDraft({ activePane: value });
  }

  const cycleAccomplishmentIds = evidenceItems.map((item) => item.id);
  const assessedCount = evidenceItems.filter(
    (item) => item.assessment_scores
  ).length;

  const isShared = feedback?.status === "shared";
  const settingsDirty =
    isEvidencePhase &&
    sessionSettings.trim() !== (feedback?.session_settings || "").trim();
  const contentDirty =
    content.trim() !== (feedback?.content || "").trim();
  const hasChanges = isEvidencePhase
    ? settingsDirty || contentDirty
    : contentDirty;
  const canFormat =
    feedbackType !== "initial" || !!content.trim();
  const formatSource = isEvidencePhase ? sessionSettings : content;
  const initialLooksLikePackageReview =
    feedbackType === "initial" && looksLikePackageReviewGuide(content);
  const canGenerate =
    isEvidencePhase &&
    !isShared &&
    !isGenerating &&
    (isFinalPhase
      ? epbItems.length > 0 && !isLoadingEpb
      : cycleAccomplishmentIds.length > 0 && !isLoadingEvidence);

  function syncFeedback(next: SupervisorFeedback | null) {
    setFeedback(next);
    onFeedbackChange(next);
  }

  async function handleSave() {
    if (isEvidencePhase) {
      if (!sessionSettings.trim() && !content.trim()) {
        toast.error("Add session settings or a feedback guide before saving");
        return;
      }
    } else if (!content.trim()) {
      toast.error("Session guide cannot be empty");
      return;
    }
    if (!subordinateId && !teamMemberId) {
      toast.error("No ratee selected");
      return;
    }

    setIsSaving(true);
    const reviewedIds = isMidtermPhase
      ? cycleAccomplishmentIds
      : (feedback?.reviewed_accomplishment_ids ?? []);

    const result = await saveFeedback(
      subordinateId,
      teamMemberId,
      feedbackType,
      cycleYear,
      content.trim(),
      reviewedIds,
      isEvidencePhase ? sessionSettings : null
    );

    if (result.error || !result.data) {
      toast.error(result.error || "Failed to save session guide");
      setIsSaving(false);
      return;
    }

    if (feedbackType === "initial") {
      const expResult = await setExpectation(
        subordinateId,
        teamMemberId,
        content.trim(),
        cycleYear
      );
      if (expResult.error) {
        console.error("Upsert expectations from Initial guide:", expResult.error);
      }
    }

    syncFeedback({
      ...(feedback ?? {
        id: result.data.id,
        supervisor_id: "",
        subordinate_id: subordinateId,
        team_member_id: teamMemberId,
        feedback_type: feedbackType,
        cycle_year: cycleYear,
        status: "draft" as const,
        shared_at: null,
        supervision_start_date: "",
        supervision_end_date: null,
        created_at: new Date().toISOString(),
        reviewed_accomplishment_ids: reviewedIds,
      }),
      id: result.data.id,
      content: content.trim(),
      session_settings: isEvidencePhase
        ? sessionSettings
        : (feedback?.session_settings ?? ""),
      reviewed_accomplishment_ids: reviewedIds,
      status: feedback?.status === "shared" ? "shared" : "draft",
      updated_at: new Date().toISOString(),
    });

    toast.success(
      isEvidencePhase ? "Settings and feedback guide saved" : "Session guide saved"
    );
    onSaved?.();
    setIsSaving(false);
  }

  async function handleFormat() {
    if (!canFormat) {
      toast.error("Add notes before formatting Initial feedback");
      return;
    }
    if (!subordinateId && !teamMemberId) return;
    if (isRevising) return;

    const requestId = ++reviseRequestIdRef.current;
    setIsRevising(true);

    try {
      const response = await billableFetch("/api/revise-feedback-session-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackType,
          draftText: formatSource,
          subordinateId,
          teamMemberId,
          cycleYear,
        }),
      });

      if (requestId !== reviseRequestIdRef.current) return;

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(payload.error || "Failed to format session settings");
        return;
      }

      const payload = (await response.json()) as {
        revisedText?: string;
        warnings?: string[];
      };

      if (requestId !== reviseRequestIdRef.current) return;

      if (!payload.revisedText?.trim()) {
        toast.error("Format returned empty content");
        return;
      }

      if (isEvidencePhase) {
        updateSessionSettings(payload.revisedText);
      } else {
        updateContent(payload.revisedText);
      }

      if (payload.warnings?.includes("initial_package_review_stripped")) {
        toast.warning(
          "Removed midterm-style package review content from Initial before formatting."
        );
      }

      toast.success(
        isEvidencePhase
          ? "Session settings formatted — review and save when ready."
          : "Session guide revised — review and save when ready."
      );
    } catch (error) {
      if (requestId !== reviseRequestIdRef.current) return;
      console.error("Format session guide failed:", error);
      toast.error("Failed to format session settings");
    } finally {
      if (requestId === reviseRequestIdRef.current) {
        setIsRevising(false);
      }
    }
  }

  async function handleGenerate() {
    if (!canGenerate) {
      toast.error(
        isFinalPhase
          ? "Add EPB statements before generating the Final guide"
          : "Add cycle accomplishments before generating"
      );
      return;
    }
    if (!subordinateId && !teamMemberId) return;

    const requestId = ++generateRequestIdRef.current;
    setIsGenerating(true);

    try {
      const response = await billableFetch("/api/generate-feedback-session-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackType,
          sessionSettings,
          ...(isMidtermPhase
            ? { includedAccomplishmentIds: cycleAccomplishmentIds }
            : {}),
          subordinateId,
          teamMemberId,
          cycleYear,
        }),
      });

      if (requestId !== generateRequestIdRef.current) return;

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(payload.error || "Failed to generate feedback guide");
        return;
      }

      const payload = (await response.json()) as {
        generatedText?: string;
        warnings?: string[];
      };

      if (requestId !== generateRequestIdRef.current) return;

      if (!payload.generatedText?.trim()) {
        toast.error("Generation returned empty content");
        return;
      }

      updateContent(payload.generatedText);
      updateActivePane("guide");

      if (payload.warnings?.includes("accomplishments_truncated")) {
        toast.warning(
          "Used the 200 most recent accomplishments; older entries were omitted."
        );
      }
      if (payload.warnings?.includes("unassessed_included")) {
        toast.warning(
          "Some cycle accomplishments are not assessed — guide may note thin areas."
        );
      }

      toast.success("Feedback guide generated — review and save when ready.");
    } catch (error) {
      if (requestId !== generateRequestIdRef.current) return;
      console.error("Generate feedback guide failed:", error);
      toast.error("Failed to generate feedback guide");
    } finally {
      if (requestId === generateRequestIdRef.current) {
        setIsGenerating(false);
      }
    }
  }

  async function handleShare() {
    if (!feedback || !canShare) return;
    if (!content.trim()) {
      toast.error("Generate or write a feedback guide before sharing");
      return;
    }
    setIsSharing(true);
    const result = await shareFeedback(feedback.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      syncFeedback({
        ...feedback,
        status: "shared",
        shared_at: new Date().toISOString(),
      });
      toast.success(
        `Feedback guide shared with ${memberRank ? `${memberRank} ` : ""}${memberName}`
      );
    }
    setIsSharing(false);
    setShowShareConfirm(false);
  }

  async function handleUnshare() {
    if (!feedback) return;
    setIsSharing(true);
    const result = await unshareFeedback(feedback.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      syncFeedback({ ...feedback, status: "draft", shared_at: null });
      toast.success("Reverted to private draft");
    }
    setIsSharing(false);
  }

  async function handleDelete() {
    if (!feedback) return;
    setIsDeleting(true);
    const result = await deleteFeedback(feedback.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      syncFeedback(null);
      if (isEvidencePhase) {
        updateSessionSettings(defaultTemplate);
        updateContent("");
      } else {
        updateContent(defaultTemplate);
      }
      toast.success("Session guide deleted");
      onSaved?.();
    }
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }

  function handleCopy() {
    if (!content.trim()) {
      toast.error("Nothing to copy — generate a feedback guide first");
      return;
    }
    void navigator.clipboard.writeText(content).then(
      () => {
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Failed to copy")
    );
  }

  function handlePrint() {
    if (!content.trim()) {
      toast.error("Nothing to print — generate a feedback guide first");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up blocked — allow pop-ups to print");
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(
      getFeedbackTypeLabel(feedbackType)
    )}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;white-space:pre-wrap;line-height:1.5}</style>
</head><body>
<h1>${escapeHtml(getFeedbackTypeLabel(feedbackType))} — Feedback Session Guide</h1>
<p>${escapeHtml(memberRank ? `${memberRank} ` : "")}${escapeHtml(memberName)}</p>
<pre>${escapeHtml(content)}</pre>
</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function applyDefaultTemplate() {
    if (isEvidencePhase) {
      updateSessionSettings(defaultTemplate);
    } else {
      updateContent(defaultTemplate);
    }
    setShowTemplateConfirm(false);
    toast.success("Default ACA template applied");
  }

  function handleUseDefaultTemplate() {
    const current = isEvidencePhase ? sessionSettings : content;
    if (current.trim() && current.trim() !== defaultTemplate.trim()) {
      setShowTemplateConfirm(true);
      return;
    }
    applyDefaultTemplate();
  }

  const textareaClass = cn(
    "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50",
    "dark:bg-input/30 box-border w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px]",
    "resize-none overflow-y-auto overscroll-contain disabled:cursor-not-allowed disabled:opacity-50"
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" ref={printRef}>
        {!isEvidencePhase ? (
          <div className="shrink-0 space-y-2 px-4 pt-3 sm:px-6 sm:pt-4">
            <div className="flex h-6 flex-wrap items-center gap-2">
              <Badge variant="outline">{formLabel}</Badge>
              <Badge
                variant={isShared ? "default" : "secondary"}
                className={cn(
                  "gap-1",
                  !feedback && "invisible",
                  isShared &&
                    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                )}
              >
                {isShared ? (
                  <>
                    <Eye className="size-3" /> Shared
                  </>
                ) : (
                  <>
                    <EyeOff className="size-3" /> Draft
                  </>
                )}
              </Badge>
            </div>
          </div>
        ) : null}

        {isEvidencePhase ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1 sm:px-5">
            <div className="shrink-0 flex flex-col gap-1.5 border-b py-1.5">
              <Tabs
                value={activePane}
                onValueChange={(value) => {
                  if (value === "settings" || value === "guide") {
                    updateActivePane(value);
                  }
                }}
                className="gap-0"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <TabsList
                      className="grid h-9 w-full max-w-sm grid-cols-2"
                      aria-label="Editor pane"
                    >
                      <TabsTrigger
                        value="settings"
                        className="active:scale-[0.98]"
                      >
                        Session settings
                      </TabsTrigger>
                      <TabsTrigger
                        value="guide"
                        className="active:scale-[0.98]"
                      >
                        Feedback guide
                      </TabsTrigger>
                    </TabsList>
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {formLabel}
                    </Badge>
                    <Badge
                      variant={isShared ? "default" : "secondary"}
                      className={cn(
                        "hidden gap-1 sm:inline-flex",
                        !feedback && "invisible",
                        isShared &&
                          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      )}
                    >
                      {isShared ? (
                        <>
                          <Eye className="size-3" /> Shared
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3" /> Draft
                        </>
                      )}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activePane === "settings" ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleUseDefaultTemplate}
                          disabled={isShared || isRevising || isGenerating}
                          className="h-8 text-xs active:scale-[0.98]"
                        >
                          Use default template
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleFormat()}
                          disabled={
                            isShared ||
                            isRevising ||
                            isGenerating ||
                            !formatSource.trim()
                          }
                          className="h-8 min-w-[7.5rem] text-xs active:scale-[0.98]"
                          aria-label="Format session settings"
                        >
                          {isRevising ? (
                            <>
                              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              Formatting...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-1.5 size-3.5" />
                              Format settings
                            </>
                          )}
                          <TokenCostBadge compact className="ml-1.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={!canGenerate || isRevising}
                        className="h-8 text-xs active:scale-[0.98]"
                        aria-label="Generate feedback session guide from assessments"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-1.5 size-3.5" />
                            Generate feedback guide
                          </>
                        )}
                        <TokenCostBadge compact className="ml-1.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Tabs>
              {activePane === "guide" && isShared ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Shared guides are locked. Unshare to edit.
                </p>
              ) : null}
            </div>

            {/* height:0 + flex-1 forces the textarea to consume leftover dialog height */}
            {activePane === "settings" ? (
              <textarea
                id={`session-settings-${feedbackType}`}
                value={sessionSettings}
                onChange={(e) => updateSessionSettings(e.target.value)}
                disabled={isShared}
                aria-label={`${getFeedbackTypeLabel(feedbackType)} session settings`}
                className={cn(
                  textareaClass,
                  "my-1.5 min-h-0 w-full flex-1 text-[13px] leading-relaxed"
                )}
                style={{
                  fieldSizing: "fixed",
                  flex: "1 1 0",
                  height: 0,
                  minHeight: 0,
                  resize: "none",
                }}
              />
            ) : (
              <textarea
                id={`session-guide-${feedbackType}`}
                value={content}
                onChange={(e) => updateContent(e.target.value)}
                disabled={isShared}
                placeholder={
                  isFinalPhase
                    ? "Generate from the EPB package — or write your outline brief here."
                    : "Generate from ACA strengths & weaknesses — or write your outline brief here."
                }
                aria-label={`${getFeedbackTypeLabel(feedbackType)} feedback session guide`}
                className={cn(
                  textareaClass,
                  "my-1.5 min-h-0 w-full flex-1 text-[13px] leading-relaxed"
                )}
                style={{
                  fieldSizing: "fixed",
                  flex: "1 1 0",
                  height: 0,
                  minHeight: 0,
                  resize: "none",
                }}
              />
            )}

            <section
              className="shrink-0 border-t bg-background pt-2"
              aria-labelledby={`source-${feedbackType}`}
            >
              <button
                type="button"
                id={`source-${feedbackType}`}
                onClick={() => setStrengthsOpen((open) => !open)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left",
                  "bg-muted/40 shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]",
                  "transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "hover:bg-muted/70 active:scale-[0.99]",
                  strengthsOpen && "rounded-b-none bg-muted/55"
                )}
                aria-expanded={strengthsOpen}
                aria-controls={`source-panel-${feedbackType}`}
              >
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    strengthsOpen && "rotate-180"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    id={`source-label-${feedbackType}`}
                    className="block text-sm font-medium leading-tight"
                  >
                    {isFinalPhase ? (
                      <>
                        EPB package
                        {epbItems.length > 0
                          ? ` (${epbItems.length} MPA${epbItems.length === 1 ? "" : "s"})`
                          : ""}
                      </>
                    ) : (
                      <>
                        Strengths & weaknesses
                        {assessedCount > 0
                          ? ` (${assessedCount} assessed)`
                          : evidenceItems.length > 0
                            ? " (none assessed yet)"
                            : ""}
                      </>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {strengthsOpen
                      ? isFinalPhase
                        ? "Hide EPB statements used for Generate"
                        : "Hide ACA proficiency summary used for Generate"
                      : isFinalPhase
                        ? "Show EPB narrative used for Final Generate"
                        : "Show ACA proficiency bands from assessed entries"}
                  </span>
                </span>
                {content.trim() ? (
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    Guide ready
                  </Badge>
                ) : null}
              </button>
              <div
                id={`source-panel-${feedbackType}`}
                className="t-collapse-grid rounded-b-md border border-t-0 border-border/60 bg-background"
                data-open={strengthsOpen ? "true" : "false"}
              >
                <div>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto overscroll-contain px-2 py-2">
                    {isFinalPhase ? (
                      <>
                        {onRefreshEpb ? (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={onRefreshEpb}
                              disabled={isLoadingEpb || isShared || isGenerating}
                              className="h-7 text-xs active:scale-[0.98]"
                            >
                              Refresh
                            </Button>
                          </div>
                        ) : null}
                        <FeedbackEpbPackagePanel
                          items={epbItems}
                          isLoading={isLoadingEpb}
                          error={epbError}
                          compact
                        />
                      </>
                    ) : (
                      <>
                        {onRefreshEvidence ? (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={onRefreshEvidence}
                              disabled={
                                isLoadingEvidence || isShared || isGenerating
                              }
                              className="h-7 text-xs active:scale-[0.98]"
                            >
                              Refresh
                            </Button>
                          </div>
                        ) : null}
                        <FeedbackAcaStrengthsWeaknesses
                          items={evidenceItems}
                          rateeRank={memberRank}
                          truncated={evidenceTruncated}
                          isLoading={isLoadingEvidence}
                          error={evidenceError}
                          compact
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-2 px-4 pt-1 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label
                  htmlFor={`session-guide-${feedbackType}`}
                  className="flex items-center gap-2"
                >
                  <FileText className="size-4" />
                  Session guide (private)
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleUseDefaultTemplate}
                    disabled={isShared || isRevising}
                    className="h-8 text-xs active:scale-[0.98]"
                  >
                    Use default template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleFormat()}
                    disabled={isShared || isRevising || !canFormat}
                    className="h-8 min-w-[7.5rem] text-xs active:scale-[0.98]"
                    aria-label={`Revise ${getFeedbackTypeLabel(feedbackType)} session guide`}
                  >
                    {isRevising ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Revising...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 size-3.5" />
                        Revise
                      </>
                    )}
                    <TokenCostBadge compact className="ml-1.5" />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                AFI 36-2406 Initial ACA ({formLabel}): expectations + Knowing Your
                Airman — not a package review. Fill blanks, then Revise to format.
              </p>
              {initialLooksLikePackageReview ? (
                <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  This Initial draft looks like an old midterm package review (scores /
                  evidence). Use{" "}
                  <span className="font-medium">Use default template</span> to reset,
                  or Revise will strip those sections automatically.
                </div>
              ) : (
                <p
                  className={cn(
                    "min-h-4 text-xs text-amber-600 dark:text-amber-400",
                    !isShared && "invisible"
                  )}
                >
                  Shared guides are locked. Unshare to edit.
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-4 py-2 sm:px-6">
              <textarea
                id={`session-guide-${feedbackType}`}
                value={content}
                onChange={(e) => updateContent(e.target.value)}
                disabled={isShared}
                aria-label={`${getFeedbackTypeLabel(feedbackType)} session guide`}
                className={cn(textareaClass, "h-full")}
                style={{
                  fieldSizing: "fixed",
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                  resize: "none",
                }}
              />
            </div>
          </>
        )}

        <div
          className={cn(
            "flex shrink-0 flex-col gap-2 border-t bg-background sm:flex-row sm:flex-wrap sm:items-center",
            isEvidencePhase
              ? "min-h-12 px-3 py-2 sm:px-5"
              : "min-h-[4.5rem] px-4 py-3 sm:px-6 sm:py-4"
          )}
        >
          <div className="flex w-8 shrink-0 items-center">
            {feedback && !isShared ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || isDeleting}
                className="text-destructive hover:text-destructive active:scale-[0.98]"
                aria-label="Delete session guide"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:mr-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="active:scale-[0.98]"
            >
              <Copy className="mr-1.5 size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="active:scale-[0.98]"
            >
              <Printer className="mr-1.5 size-3.5" />
              Print
            </Button>
          </div>
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
            <div className="flex min-h-10 min-w-[10rem] items-center justify-stretch sm:justify-end">
              {canShare && feedback && !isShared ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowShareConfirm(true)}
                  disabled={isSharing || hasChanges || !content.trim()}
                  className="h-10 w-full active:scale-[0.98] sm:w-auto"
                  title={
                    hasChanges
                      ? "Save before sharing"
                      : !content.trim()
                        ? "Generate a feedback guide before sharing"
                        : undefined
                  }
                >
                  Share with {memberRank ? `${memberRank} ` : ""}
                  {memberName}
                </Button>
              ) : canShare && feedback && isShared ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleUnshare()}
                  disabled={isSharing}
                  className="h-10 w-full active:scale-[0.98] sm:w-auto"
                >
                  Unshare
                </Button>
              ) : !canShare ? (
                <p className="text-xs text-muted-foreground sm:max-w-[14rem]">
                  Ratee is not in the app — Copy/Print instead of Share.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                isSaving ||
                isShared ||
                !hasChanges ||
                (isEvidencePhase
                  ? !sessionSettings.trim() && !content.trim()
                  : !content.trim())
              }
              className="h-10 min-w-[7.5rem] active:scale-[0.98]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save draft"
              )}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showTemplateConfirm} onOpenChange={setShowTemplateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace with default template?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your{" "}
              {isEvidencePhase ? "session settings" : "current editor text"} with
              the ACA {formLabel} starter. Unsaved edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyDefaultTemplate}>
              Use default template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showShareConfirm} onOpenChange={setShowShareConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share feedback guide?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberRank ? `${memberRank} ` : ""}
              {memberName} will be able to read the Feedback Session Guide (not
              your private session settings). You can unshare later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSharing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleShare()}
              disabled={isSharing}
            >
              {isSharing ? "Sharing..." : "Share"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session guide?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the saved{" "}
              {getFeedbackTypeLabel(feedbackType)} guide for this cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
