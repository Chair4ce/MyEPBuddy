"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import { scanStatementText, getScanSummary } from "@/lib/sensitive-data-scanner";
import { AiModelSurveyModal, useAiModelSurvey, trackGenerationForSurvey } from "@/components/modals/ai-model-survey-modal";
import { DECORATION_TYPES, DECORATION_REASONS } from "@/features/decorations/constants";
import { cn, getFullName } from "@/lib/utils";
import {
  Medal,
  Save,
  Share2,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  RotateCcw,
  Trash2,
  AlertTriangle,
  MoreVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DecorationStatementSelector } from "@/components/decoration/decoration-statement-selector";
import { DecorationCitationEditor } from "@/components/decoration/decoration-citation-editor";
import { DecorationShellShareDialog } from "@/components/decoration/decoration-shell-share-dialog";
import { CreateReviewLinkDialog } from "@/components/review/create-review-link-dialog";
import { FeedbackListDialog } from "@/components/feedback/feedback-list-dialog";
import { FeedbackViewerDialog } from "@/components/feedback/feedback-viewer-dialog";
import { FeedbackBadge } from "@/components/feedback/feedback-badge";
import { MessageSquareText } from "lucide-react";
import type {
  RefinedStatement,
  DecorationShell,
  DecorationAwardType,
  DecorationReason,
  Profile,
  ManagedMember,
  Rank,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface DecorationShellInput {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  award_type: DecorationAwardType;
  reason: DecorationReason;
}

interface DecorationWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shell: DecorationShellInput;
  onSaved?: () => void;
}

interface RateeInfo {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  isManagedMember: boolean;
  gender?: "male" | "female";
}

// ============================================================================
// Component
// ============================================================================

export function DecorationWorkspaceDialog({
  open,
  onOpenChange,
  shell,
  onSaved,
}: DecorationWorkspaceDialogProps) {
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();

  // Decoration shell store
  const {
    currentShell,
    setCurrentShell,
    awardType,
    setAwardType,
    reason,
    setReason,
    dutyTitle,
    setDutyTitle,
    office,
    setOffice,
    squadron,
    setSquadron,
    groupName,
    setGroupName,
    wing,
    setWing,
    baseName,
    setBaseName,
    location,
    setLocation,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    citationText,
    setCitationText,
    selectedStatementIds,
    statementColors,
    selectedRatee,
    setSelectedRatee,
    isLoadingShell,
    setIsLoadingShell,
    isSaving,
    setIsSaving,
    isDirty,
    setIsDirty,
    reset,
  } = useDecorationShellStore();

  // AI model survey (one-time)
  const aiSurvey = useAiModelSurvey("decoration");

  // Local state
  const [statements, setStatements] = useState<RefinedStatement[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showReviewLinkDialog, setShowReviewLinkDialog] = useState(false);
  const [showFeedbackListDialog, setShowFeedbackListDialog] = useState(false);
  const [showFeedbackViewerDialog, setShowFeedbackViewerDialog] = useState(false);
  const [selectedFeedbackSessionId, setSelectedFeedbackSessionId] = useState<string | null>(null);
  const [feedbackBadgeRefreshKey, setFeedbackBadgeRefreshKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rateeInfo, setRateeInfo] = useState<RateeInfo | null>(null);

  // Mobile orientation state
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [dismissedLandscapeHint, setDismissedLandscapeHint] = useState(false);

  // ============================================================================
  // Effects
  // ============================================================================

  // Detect mobile portrait orientation
  useEffect(() => {
    if (typeof window === "undefined" || !open) return;

    const checkOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsMobilePortrait(isMobile && isPortrait);
    };

    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, [open]);

  // Load shell data when dialog opens
  useEffect(() => {
    async function loadShellData() {
      if (!open || !shell) return;

      setIsLoadingShell(true);

      try {
        const { data: shellData } = await supabase
          .from("decoration_shells")
          .select("*")
          .eq("id", shell.id)
          .single();

        if (shellData) {
          setCurrentShell(shellData as DecorationShell);
        }
      } catch (error) {
        console.error("Error loading shell data:", error);
        toast.error("Failed to load decoration");
      } finally {
        setIsLoadingShell(false);
      }
    }

    loadShellData();
  }, [open, shell, supabase, setCurrentShell, setIsLoadingShell]);

  // Determine ratee info from shell
  useEffect(() => {
    if (!shell || !profile) return;

    let info: RateeInfo | null = null;

    if (shell.team_member_id) {
      // It's a managed member
      const member = managedMembers.find((m) => m.id === shell.team_member_id);
      if (member) {
        info = {
          id: member.id,
          fullName: member.full_name, // Managed members only have full_name
          rank: member.rank as Rank | null,
          afsc: member.afsc,
          unit: member.unit,
          isManagedMember: true,
        };
      }
    } else if (shell.user_id === profile.id) {
      // It's the user's own shell
      info = {
        id: profile.id,
        fullName: getFullName(profile), // Use utility to get proper full name
        rank: profile.rank as Rank | null,
        afsc: profile.afsc,
        unit: profile.unit,
        isManagedMember: false,
      };
    } else {
      // It's a subordinate's shell
      const sub = subordinates.find((s) => s.id === shell.user_id);
      if (sub) {
        info = {
          id: sub.id,
          fullName: getFullName(sub), // Use utility to get proper full name
          rank: sub.rank as Rank | null,
          afsc: sub.afsc,
          unit: sub.unit,
          isManagedMember: false,
        };
      }
    }

    setRateeInfo(info);
    if (info) {
      setSelectedRatee({
        id: info.id,
        fullName: info.fullName,
        rank: info.rank,
        afsc: info.afsc,
        unit: info.unit,
        isManagedMember: info.isManagedMember,
        gender: info.gender,
      });
      // Auto-populate office from ratee profile if not already set
      if (!office && info.unit) {
        setOffice(info.unit);
      }
    }
  }, [shell, profile, subordinates, managedMembers, setSelectedRatee, office, setOffice]);

  // Load refined statements (finalized statements library) for the ratee
  useEffect(() => {
    async function loadStatements() {
      if (!rateeInfo) return;

      if (rateeInfo.isManagedMember) {
        // For managed members, get their refined statements
        const { data } = await supabase
          .from("refined_statements")
          .select("*")
          .eq("team_member_id", rateeInfo.id)
          .order("created_at", { ascending: false });
        setStatements((data as RefinedStatement[]) || []);
      } else {
        // For self or linked users, get statements by user_id with no team_member_id
        const { data } = await supabase
          .from("refined_statements")
          .select("*")
          .eq("user_id", rateeInfo.id)
          .is("team_member_id", null)
          .order("created_at", { ascending: false });
        setStatements((data as RefinedStatement[]) || []);
      }
    }
    loadStatements();
  }, [rateeInfo, supabase]);

  // Reset store when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setDismissedLandscapeHint(false);
    }
  }, [open, reset]);

  // ============================================================================
  // Handlers
  // ============================================================================

  // Save shell
  const handleSaveShell = useCallback(async () => {
    if (!currentShell || !profile) return;

    // Scan citation text for PII/CUI/classification markings before saving
    if (citationText) {
      const matches = scanStatementText(citationText);
      if (matches.length > 0) {
        toast.error(getScanSummary(matches), { duration: 10000 });
        return;
      }
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("decoration_shells")
        .update({
          award_type: awardType,
          reason,
          duty_title: dutyTitle,
          office,
          squadron,
          group_name: groupName,
          wing,
          base_name: baseName,
          location,
          start_date: startDate || null,
          end_date: endDate || null,
          citation_text: citationText,
          selected_statement_ids: selectedStatementIds,
          statement_colors: statementColors,
        } as never)
        .eq("id", currentShell.id);

      if (error) throw error;

      Analytics.decorationSaved("manual");
      setIsDirty(false);
      toast.success("Decoration saved successfully");
      onSaved?.();
    } catch (error) {
      console.error("Error saving decoration shell:", error);
      toast.error("Failed to save decoration");
    } finally {
      setIsSaving(false);
    }
  }, [
    currentShell,
    profile,
    awardType,
    reason,
    dutyTitle,
    office,
    squadron,
    groupName,
    wing,
    baseName,
    location,
    startDate,
    endDate,
    citationText,
    selectedStatementIds,
    statementColors,
    supabase,
    setIsSaving,
    setIsDirty,
    onSaved,
  ]);

  // Silent save for autosave (no toast notifications)
  const handleSilentSave = useCallback(async () => {
    if (!currentShell || !profile || isSaving) return;

    // Scan citation text for PII/CUI/classification markings before autosaving
    if (citationText) {
      const matches = scanStatementText(citationText);
      if (matches.length > 0) {
        toast.error(getScanSummary(matches), { duration: 10000 });
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("decoration_shells")
        .update({
          award_type: awardType,
          reason,
          duty_title: dutyTitle,
          office,
          squadron,
          group_name: groupName,
          wing,
          base_name: baseName,
          location,
          start_date: startDate || null,
          end_date: endDate || null,
          citation_text: citationText,
          selected_statement_ids: selectedStatementIds,
          statement_colors: statementColors,
        } as never)
        .eq("id", currentShell.id);

      if (error) throw error;

      setIsDirty(false);
    } catch (error) {
      console.error("Autosave error:", error);
      // Silent fail - user can still manually save
    }
  }, [
    currentShell,
    profile,
    isSaving,
    awardType,
    reason,
    dutyTitle,
    office,
    squadron,
    groupName,
    wing,
    baseName,
    location,
    startDate,
    endDate,
    citationText,
    selectedStatementIds,
    statementColors,
    supabase,
    setIsDirty,
  ]);

  // Autosave timeout ref
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Delete the decoration shell
  const handleDeleteShell = useCallback(async () => {
    if (!currentShell) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("decoration_shells")
        .delete()
        .eq("id", currentShell.id);

      if (error) throw error;

      Analytics.decorationDeleted();
      toast.success("Decoration deleted");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error("Error deleting decoration shell:", error);
      toast.error("Failed to delete decoration");
    } finally {
      setIsDeleting(false);
    }
  }, [currentShell, supabase, onOpenChange, onSaved]);

  // Handle applying feedback suggestions
  const handleApplySuggestion = useCallback(async (sectionKey: string, newText: string) => {
    if (!currentShell) return;

    // Decorations only have one section: citation
    if (sectionKey === "citation") {
      setCitationText(newText);
      toast.success("Suggestion applied to citation");
    } else {
      toast.error("Could not find matching section to apply suggestion");
    }
  }, [currentShell, setCitationText]);

  // Generate citation — shared handler for both statement selector and citation editor
  const handleGenerateCitation = useCallback(async () => {
    // Read latest values from the store to avoid stale closures
    const store = useDecorationShellStore.getState();

    if (store.selectedStatementIds.length === 0) {
      toast.error("Please select at least one statement");
      return;
    }
    if (!store.selectedRatee) {
      toast.error("No ratee selected");
      return;
    }

    store.setIsGenerating(true);

    try {
      const statementTexts = store.getSelectedStatementTexts(statements);

      const response = await fetch("/api/generate-decoration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId: store.selectedRatee.id,
          rateeRank: store.selectedRatee.rank || "",
          rateeName: store.selectedRatee.fullName || "",
          rateeGender: store.selectedRatee.gender,
          dutyTitle: store.dutyTitle || "member",
          office: store.office || "",
          squadron: store.squadron || "",
          groupName: store.groupName || "",
          wing: store.wing || "",
          baseName: store.baseName || "",
          location: store.location || "",
          startDate: store.startDate || "",
          endDate: store.endDate || "",
          awardType: store.awardType,
          reason: store.reason,
          accomplishments: statementTexts,
          model: store.selectedModel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate citation");
      }

      const data = await response.json();
      store.setCitationText(data.citation);
      trackGenerationForSurvey();

      if (!data.metadata.withinLimit) {
        toast.warning(
          `Citation is ${data.metadata.characterCount} characters (${data.metadata.maxCharacters} max). Consider editing to shorten.`
        );
      } else {
        toast.success("Citation generated successfully");
      }
    } catch (error) {
      console.error("Generate error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate citation");
    } finally {
      useDecorationShellStore.getState().setIsGenerating(false);
    }
  }, [statements]);

  // Determine if user can edit this shell
  const canEdit = useMemo(() => {
    if (!profile || !shell) return false;
    // User created this shell
    if (shell.created_by === profile.id) return true;
    // User owns this shell (their own decoration)
    if (shell.user_id === profile.id && !shell.team_member_id) return true;
    // User is a supervisor of the shell owner
    if (subordinates.some((s) => s.id === shell.user_id)) return true;
    // User owns the managed member
    const member = managedMembers.find((m) => m.id === shell.team_member_id);
    if (member && member.supervisor_id === profile.id) return true;
    return false;
  }, [profile, shell, subordinates, managedMembers]);

  // Get decoration config
  const decorationConfig = useMemo(() => {
    return DECORATION_TYPES.find((d) => d.key === awardType);
  }, [awardType]);

  // Autosave effect - triggers 2 seconds after changes stop
  useEffect(() => {
    // Clear any existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Only autosave if dirty and dialog is open and user can edit
    if (isDirty && open && currentShell && canEdit) {
      autosaveTimeoutRef.current = setTimeout(() => {
        handleSilentSave();
      }, 2000); // 2 second debounce
    }

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [isDirty, open, currentShell, canEdit, handleSilentSave]);

  // ============================================================================
  // Render
  // ============================================================================

  const rateeDisplayName = rateeInfo
    ? `${rateeInfo.rank || ""} ${rateeInfo.fullName || ""}`.trim()
    : "Unknown";

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="!fixed !inset-0 !translate-x-0 !translate-y-0 !top-0 !left-0 w-screen h-screen !max-w-none !max-h-none flex flex-col overflow-hidden p-0 !rounded-none"
        >
          {/* Mobile Portrait Landscape Hint */}
          {isMobilePortrait && !dismissedLandscapeHint && (
            <div className="bg-gradient-to-r from-primary/15 to-primary/5 border-b border-primary/20 px-3 py-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <Smartphone className="size-4 text-primary" />
                    <RotateCcw className="size-2.5 text-primary absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-primary">Best viewed in landscape</p>
                    <p className="text-[10px] text-muted-foreground">
                      Rotate phone for better editing experience
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissedLandscapeHint(true)}
                  className="shrink-0 h-7 w-7 p-0"
                >
                  <X className="size-3.5" />
                  <span className="sr-only">Dismiss</span>
                </Button>
              </div>
            </div>
          )}

          <DialogHeader className="px-4 pt-3 pb-3 border-b shrink-0">
            {/* Header row: Icon + Title/Description + Action buttons */}
            <div className="flex items-center justify-between gap-3">
              {/* Left side: Icon and info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Medal className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold leading-tight truncate">
                    {rateeDisplayName}&apos;s Decoration
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {decorationConfig?.name || "Decoration"} •{" "}
                    {decorationConfig?.abbreviation || awardType.toUpperCase()}
                  </DialogDescription>
                </div>
              </div>

              {/* Right side: Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveShell}
                        disabled={isSaving || isLoadingShell}
                        className="h-8 w-8 p-0 relative"
                      >
                        {isSaving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        {isDirty && (
                          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
                        )}
                        <span className="sr-only">Save</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes</TooltipContent>
                  </Tooltip>
                )}
                <FeedbackBadge
                  shellType="decoration"
                  shellId={currentShell?.id || ""}
                  onClick={() => setShowFeedbackListDialog(true)}
                  refreshKey={feedbackBadgeRefreshKey}
                  className="h-8"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReviewLinkDialog(true)}
                      className="h-8 w-8 p-0"
                    >
                      <MessageSquareText className="size-4" />
                      <span className="sr-only">Get Feedback</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Get Feedback</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowShareDialog(true)}
                      className="h-8 w-8 p-0"
                    >
                      <Share2 className="size-4" />
                      <span className="sr-only">Share</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Share</TooltipContent>
                </Tooltip>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="size-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete Decoration
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-destructive" />
                        Delete Decoration
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this decoration for{" "}
                        <strong>{rateeDisplayName}</strong>? This will permanently
                        delete the citation and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteShell}
                        disabled={isDeleting}
                        className="bg-destructive text-white hover:bg-destructive/90"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="size-4 mr-1.5 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="size-4 mr-1.5" />
                            Delete Permanently
                          </>
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="w-px h-5 bg-border mx-1" />
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <X className="size-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 relative">
            {/* Floating landscape hint button */}
            {isMobilePortrait && dismissedLandscapeHint && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDismissedLandscapeHint(false)}
                className="fixed bottom-20 right-4 z-50 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30"
              >
                <RotateCcw className="size-4 mr-1.5 text-primary" />
                <span className="text-xs">Rotate phone</span>
              </Button>
            )}

            <div className="p-3 sm:p-6 space-y-4">
              {/* Settings Collapsible */}
              {canEdit && (
                <Collapsible open={showConfig} onOpenChange={setShowConfig}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium">Settings</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {decorationConfig?.abbreviation || awardType.toUpperCase()} •{" "}
                          {DECORATION_REASONS.find((r) => r.key === reason)?.label || reason}
                        </span>
                        {showConfig ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  {/* Smooth animated expand */}
                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-in-out",
                      showConfig ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="pt-3 space-y-3">
                        {/* 2-column grid for symmetrical layout */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          {/* Award | Reason */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Award</Label>
                            <Select
                              value={awardType}
                              onValueChange={(v) => setAwardType(v as DecorationAwardType)}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DECORATION_TYPES.map((d) => (
                                  <SelectItem key={d.key} value={d.key}>
                                    {d.abbreviation} - {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Reason</Label>
                            <Select
                              value={reason}
                              onValueChange={(v) => setReason(v as DecorationReason)}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DECORATION_REASONS.map((r) => (
                                  <SelectItem key={r.key} value={r.key}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Duty Title | Office */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Duty Title</Label>
                            <Input
                              aria-label="Duty Title"
                              value={dutyTitle}
                              onChange={(e) => setDutyTitle(e.target.value)}
                              placeholder="e.g., Flight Chief"
                              className="h-8 w-full text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Office</Label>
                            <Input
                              aria-label="Office"
                              value={office}
                              onChange={(e) => setOffice(e.target.value)}
                              placeholder="e.g., 42 CS/SCOO"
                              className="h-8 w-full text-xs"
                            />
                          </div>

                          {/* Squadron | Group (optional) */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Squadron</Label>
                            <Input
                              aria-label="Squadron"
                              value={squadron}
                              onChange={(e) => setSquadron(e.target.value)}
                              placeholder="e.g., 42d Communications Squadron"
                              className="h-8 w-full text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Group <span className="text-muted-foreground/60">(optional)</span>
                            </Label>
                            <Input
                              aria-label="Group"
                              value={groupName}
                              onChange={(e) => setGroupName(e.target.value)}
                              placeholder="e.g., 42d Mission Support Group"
                              className="h-8 w-full text-xs"
                            />
                          </div>

                          {/* Wing (optional) | Base */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Wing <span className="text-muted-foreground/60">(optional)</span>
                            </Label>
                            <Input
                              aria-label="Wing"
                              value={wing}
                              onChange={(e) => setWing(e.target.value)}
                              placeholder="e.g., 42d Air Base Wing"
                              className="h-8 w-full text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Base</Label>
                            <Input
                              aria-label="Base Name"
                              value={baseName}
                              onChange={(e) => setBaseName(e.target.value)}
                              placeholder="e.g., Maxwell Air Force Base"
                              className="h-8 w-full text-xs"
                            />
                          </div>

                          {/* State/Country | Start | End */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">State / Country</Label>
                            <Input
                              aria-label="State or Country"
                              value={location}
                              onChange={(e) => setLocation(e.target.value)}
                              placeholder="e.g., Alabama"
                              className="h-8 w-full text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Start</Label>
                              <Input
                                type="date"
                                aria-label="Start Date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-8 w-full text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">End</Label>
                              <Input
                                type="date"
                                aria-label="End Date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-8 w-full text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Collapsible>
              )}

              {/* Loading State */}
              {isLoadingShell ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : (
                /* Main Content */
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Statement Selector */}
                  <DecorationStatementSelector statements={statements} onGenerate={handleGenerateCitation} />

                  {/* Citation Editor */}
                  <DecorationCitationEditor statements={statements} />
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {currentShell && (
        <DecorationShellShareDialog
          shellId={currentShell.id}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          ratee={{
            id: rateeInfo?.id || "",
            fullName: rateeInfo?.fullName || null,
            rank: rateeInfo?.rank || null,
            isManagedMember: rateeInfo?.isManagedMember || false,
          }}
          currentUserId={profile?.id}
        />
      )}

      {/* Review Link Dialog - For mentor feedback */}
      {currentShell && (
        <CreateReviewLinkDialog
          open={showReviewLinkDialog}
          onOpenChange={setShowReviewLinkDialog}
          shellType="decoration"
          shellId={currentShell.id}
          rateeName={rateeInfo?.fullName || "Unknown"}
          rateeRank={rateeInfo?.rank || undefined}
          contentSnapshot={{
            title: DECORATION_TYPES.find((t) => t.key === currentShell.award_type)?.name || currentShell.award_type,
            sections: [
              {
                key: "citation",
                label: "Citation",
                content: citationText,
              },
            ],
          }}
        />
      )}

      {/* Feedback List Dialog */}
      {currentShell && (
        <FeedbackListDialog
          open={showFeedbackListDialog}
          onOpenChange={setShowFeedbackListDialog}
          shellType="decoration"
          shellId={currentShell.id}
          onViewSession={(sessionId) => {
            setSelectedFeedbackSessionId(sessionId);
            setShowFeedbackListDialog(false);
            setShowFeedbackViewerDialog(true);
          }}
        />
      )}

      {/* Feedback Viewer Dialog */}
      {currentShell && (
        <FeedbackViewerDialog
          open={showFeedbackViewerDialog}
          onOpenChange={(open) => {
            setShowFeedbackViewerDialog(open);
            if (!open) {
              setFeedbackBadgeRefreshKey(k => k + 1);
            }
          }}
          sessionId={selectedFeedbackSessionId}
          shellType="decoration"
          shellId={currentShell.id}
          onBack={() => {
            setShowFeedbackViewerDialog(false);
            setShowFeedbackListDialog(true);
            setFeedbackBadgeRefreshKey(k => k + 1);
          }}
          onApplySuggestion={handleApplySuggestion}
          getCurrentText={(sectionKey) => {
            // Decorations only have citation section
            if (sectionKey === "citation") {
              return citationText;
            }
            return "";
          }}
        />
      )}

      {/* AI Model Survey - one-time */}
      <AiModelSurveyModal
        open={aiSurvey.showSurvey}
        onOpenChange={aiSurvey.onOpenChange}
        sourcePage={aiSurvey.sourcePage}
      />
    </TooltipProvider>
  );
}
