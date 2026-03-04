"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAwardShellStore } from "@/stores/award-shell-store";
import { Analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import { scanStatementText, getScanSummary } from "@/lib/sensitive-data-scanner";
import {
  AWARD_1206_CATEGORIES,
  AWARD_LEVELS,
  AWARD_CATEGORIES,
} from "@/lib/constants";
import { ModelSelector } from "@/components/model-selector";
import { AiModelSurveyModal, useAiModelSurvey } from "@/components/modals/ai-model-survey-modal";
import { cn } from "@/lib/utils";
import { toDisplayText, fromDisplayText } from "@/lib/bullet-fitting";
import {
  Award,
  Copy,
  Check,
  Eye,
  Printer,
  Loader2,
  Save,
  Share2,
  ChevronDown,
  ChevronUp,
  X,
  RotateCcw,
  Smartphone,
  Trash2,
  CalendarDays,
  MoreVertical,
  Settings2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AwardCategorySectionCard } from "@/components/award/award-category-section";
import { DeleteAwardDialog } from "@/components/award/delete-award-dialog";
import { AwardShellShareDialog } from "@/components/award/award-shell-share-dialog";
import { AwardPromptSettingsModal } from "@/components/award/award-prompt-settings-modal";
import { CreateReviewLinkDialog } from "@/components/review/create-review-link-dialog";
import { FeedbackListDialog } from "@/components/feedback/feedback-list-dialog";
import { FeedbackViewerDialog } from "@/components/feedback/feedback-viewer-dialog";
import { FeedbackBadge } from "@/components/feedback/feedback-badge";
import { MessageSquareText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import type {
  Accomplishment,
  AwardLevel,
  AwardCategory,
  AwardShell,
  AwardShellSection,
  Profile,
  ManagedMember,
  Rank,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface AwardShellInput {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  cycle_year: number;
  award_level: AwardLevel;
  award_category: AwardCategory;
  sentences_per_statement: 2 | 3;
  title?: string | null;
  is_team_award?: boolean;
  created_at: string;
  updated_at: string;
}

interface AwardWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shell: AwardShellInput;
  onSaved?: () => void;
}

interface NomineeInfo {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function AwardWorkspaceDialog({
  open,
  onOpenChange,
  shell,
  onSaved,
}: AwardWorkspaceDialogProps) {
  const supabase = createClient();
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  // Awards use calendar year cycles, not SCOD-based cycles
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();

  // Award shell store
  const {
    currentShell,
    setCurrentShell,
    sections,
    setSections,
    updateSection,
    addSection,
    removeSection,
    slotStates,
    updateSlotState,
    collapsedCategories,
    toggleCategoryCollapsed,
    expandAll,
    collapseAll,
    awardLevel,
    awardCategory,
    sentencesPerStatement,
    setAwardLevel,
    setAwardCategory,
    setSentencesPerStatement,
    selectedModel,
    setSelectedModel,
    isLoadingShell,
    setIsLoadingShell,
    reset,
  } = useAwardShellStore();

  // AI model survey (one-time)
  const aiSurvey = useAiModelSurvey("award");

  // Local state
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showReviewLinkDialog, setShowReviewLinkDialog] = useState(false);
  const [showFeedbackListDialog, setShowFeedbackListDialog] = useState(false);
  const [showFeedbackViewerDialog, setShowFeedbackViewerDialog] = useState(false);
  const [selectedFeedbackSessionId, setSelectedFeedbackSessionId] = useState<string | null>(null);
  const [feedbackBadgeRefreshKey, setFeedbackBadgeRefreshKey] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [nomineeInfo, setNomineeInfo] = useState<NomineeInfo | null>(null);
  
  // Award title state
  const [awardTitle, setAwardTitle] = useState<string>("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  // Award period date range
  const [periodStartDate, setPeriodStartDate] = useState<string>("");
  const [periodEndDate, setPeriodEndDate] = useState<string>("");
  
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
    
    // Check immediately when dialog opens
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
        // Fetch shell with sections
        const { data: shellData } = await supabase
          .from("award_shells")
          .select("*, award_shell_sections(*)")
          .eq("id", shell.id)
          .single();

        if (shellData) {
          const typedShellData = shellData as AwardShell & { award_shell_sections?: AwardShellSection[] };
          const sectionsData = typedShellData.award_shell_sections || [];
          setCurrentShell(typedShellData);
          setSections(sectionsData);

          // Update award config
          setAwardLevel(typedShellData.award_level);
          setAwardCategory(typedShellData.award_category);
          setSentencesPerStatement(typedShellData.sentences_per_statement);
          
          // Update title
          setAwardTitle(typedShellData.title || "");
          
          // Update period dates
          setPeriodStartDate(typedShellData.period_start_date || "");
          setPeriodEndDate(typedShellData.period_end_date || "");
        }
      } catch (error) {
        console.error("Error loading shell data:", error);
        toast.error("Failed to load award package");
      } finally {
        setIsLoadingShell(false);
      }
    }

    loadShellData();
  }, [open, shell, supabase, setCurrentShell, setSections, setIsLoadingShell, setAwardLevel, setAwardCategory, setSentencesPerStatement]);

  // Determine nominee info from shell
  useEffect(() => {
    if (!shell || !profile) return;

    let nominee: NomineeInfo | null = null;

    if (shell.team_member_id) {
      // It's a managed member
      const member = managedMembers.find((m) => m.id === shell.team_member_id);
      if (member) {
        nominee = {
          id: member.id,
          fullName: member.full_name,
          rank: member.rank as Rank | null,
          afsc: member.afsc,
          isManagedMember: true,
        };
      }
    } else if (shell.user_id === profile.id) {
      // It's the user's own shell
      nominee = {
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank as Rank | null,
        afsc: profile.afsc,
        isManagedMember: false,
      };
    } else {
      // It's a subordinate's shell
      const sub = subordinates.find((s) => s.id === shell.user_id);
      if (sub) {
        nominee = {
          id: sub.id,
          fullName: sub.full_name,
          rank: sub.rank as Rank | null,
          afsc: sub.afsc,
          isManagedMember: false,
        };
      }
    }

    setNomineeInfo(nominee);
  }, [shell, profile, subordinates, managedMembers]);

  // Load accomplishments for the nominee
  useEffect(() => {
    async function loadAccomplishments() {
      if (!nomineeInfo) return;

      if (nomineeInfo.isManagedMember) {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("team_member_id", nomineeInfo.id)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      } else {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("user_id", nomineeInfo.id)
          .is("team_member_id", null)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      }
    }
    loadAccomplishments();
  }, [nomineeInfo, supabase]);

  // Reset store when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setAwardTitle("");
      setIsEditingTitle(false);
      setPeriodStartDate("");
      setPeriodEndDate("");
      setDismissedLandscapeHint(false);
    }
  }, [open, reset]);

  // ============================================================================
  // Handlers
  // ============================================================================

  // Save shell and all sections
  const handleSaveShell = useCallback(async () => {
    if (!nomineeInfo || !profile || !currentShell) return;

    // Scan all section texts for PII/CUI/classification markings before saving
    for (const [, slotState] of Object.entries(slotStates)) {
      if (slotState.draftText) {
        const matches = scanStatementText(slotState.draftText);
        if (matches.length > 0) {
          toast.error(getScanSummary(matches), { duration: 10000 });
          return;
        }
      }
    }

    setIsSaving(true);

    try {
      const shellId = currentShell.id;

      // Update shell config
      await supabase
        .from("award_shells")
        .update({
          award_level: awardLevel,
          award_category: awardCategory,
          sentences_per_statement: sentencesPerStatement,
          title: awardTitle.trim() || null,
          period_start_date: periodStartDate || null,
          period_end_date: periodEndDate || null,
        } as never)
        .eq("id", shellId);

      // Save all sections
      for (const [key, slotState] of Object.entries(slotStates)) {
        const [category, slotIndexStr] = key.split(":");
        const slotIndex = parseInt(slotIndexStr);
        const section = sections[key];

        if (section?.id?.startsWith("temp-")) {
          // Insert new section
          await supabase
            .from("award_shell_sections")
            .insert({
              shell_id: shellId,
              category,
              slot_index: slotIndex,
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              clarifying_answers: slotState.clarifyingAnswers || [],
              last_edited_by: profile.id,
            } as never);
        } else if (section) {
          // Update existing section
          await supabase
            .from("award_shell_sections")
            .update({
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              clarifying_answers: slotState.clarifyingAnswers || [],
              last_edited_by: profile.id,
            } as never)
            .eq("id", section.id);
        }
      }

      Analytics.awardSaved("manual");
      toast.success("Award package saved successfully");
      onSaved?.();
    } catch (error) {
      console.error("Error saving award shell:", error);
      toast.error("Failed to save award package");
    } finally {
      setIsSaving(false);
    }
  }, [nomineeInfo, profile, currentShell, awardLevel, awardCategory, sentencesPerStatement, awardTitle, periodStartDate, periodEndDate, slotStates, sections, supabase, onSaved]);

  // Delete complete handler - called after DeleteAwardDialog finishes
  const handleDeleteComplete = useCallback(() => {
    setShowDeleteDialog(false);
    onOpenChange(false);
    onSaved?.();
  }, [onOpenChange, onSaved]);

  // Combine all statements for preview - formatted like AF Form 1206
  const allStatementsForPreview = useMemo(() => {
    const lines: string[] = [];

    AWARD_1206_CATEGORIES.forEach((cat) => {
      const texts: string[] = [];
      Object.entries(slotStates).forEach(([key, state]) => {
        if (key.startsWith(`${cat.key}:`) && state.draftText.trim()) {
          texts.push(state.draftText.trim());
        }
      });
      if (texts.length > 0) {
        lines.push(cat.heading);
        // Add "- " prefix to each statement (only if not already present)
        // Check for various dash types: hyphen (-), en-dash (–), em-dash (—)
        texts.forEach((t) => {
          const hasBulletPrefix = /^[-–—]\s/.test(t);
          const prefixed = hasBulletPrefix ? t : `- ${t}`;
          lines.push(prefixed);
        });
        lines.push(""); // Blank line between categories
      }
    });

    // Remove trailing blank line
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines.join("\n");
  }, [slotStates]);

  // State for editable preview text
  const [previewText, setPreviewText] = useState("");

  // Sync preview text when dialog opens or statements change
  useEffect(() => {
    if (showPreviewDialog) {
      setPreviewText(allStatementsForPreview);
    }
  }, [showPreviewDialog, allStatementsForPreview]);

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(previewText);
    Analytics.awardPreviewCopied();
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success("Copied to clipboard");
  };

  // Handle applying feedback suggestions
  const handleApplySuggestion = useCallback(async (sectionKey: string, newText: string) => {
    if (!currentShell) return;

    // Find the slot key that matches this section category
    // The sectionKey from feedback is just the category (e.g., "leadership")
    const matchingSlotKey = Object.keys(slotStates).find(key => key.startsWith(`${sectionKey}:`));
    
    if (matchingSlotKey) {
      const [category, slotIndexStr] = matchingSlotKey.split(":");
      const slotIndex = parseInt(slotIndexStr);
      
      // Update the slot state with the new text
      updateSlotState(category, slotIndex, { 
        draftText: newText, 
        isDirty: true 
      });
      
      toast.success("Suggestion applied to statement");
    } else {
      toast.error("Could not find matching section to apply suggestion");
    }
  }, [currentShell, slotStates, updateSlotState]);

  // Count total statements with content
  const totalStatementsWithContent = useMemo(() => {
    return Object.values(slotStates).filter((s) => s.draftText.trim()).length;
  }, [slotStates]);

  // Get sections for a category
  const getSectionsForCategory = useCallback(
    (categoryKey: string) => {
      return Object.entries(sections)
        .filter(([key]) => key.startsWith(`${categoryKey}:`))
        .map(([key, section]) => {
          const slotIndex = parseInt(key.split(":")[1]);
          const slotState = slotStates[key];
          return { key, section, slotIndex, slotState };
        })
        .sort((a, b) => a.slotIndex - b.slotIndex);
    },
    [sections, slotStates]
  );

  // Determine if user can edit this shell
  const canEdit = useMemo(() => {
    if (!profile || !shell) return false;
    // User created this shell
    if (shell.created_by === profile.id) return true;
    // User owns this shell (their own EPB)
    if (shell.user_id === profile.id && !shell.team_member_id) return true;
    // User is a supervisor of the shell owner
    if (subordinates.some((s) => s.id === shell.user_id)) return true;
    // User owns the managed member
    const member = managedMembers.find((m) => m.id === shell.team_member_id);
    if (member && member.supervisor_id === profile.id) return true;
    return false;
  }, [profile, shell, subordinates, managedMembers]);

  // Check if any slot has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return Object.values(slotStates).some((s) => s.isDirty);
  }, [slotStates]);

  // Silent save for autosave (no toast notifications)
  const handleSilentSave = useCallback(async () => {
    if (!nomineeInfo || !profile || !currentShell || isSaving) return;

    try {
      const shellId = currentShell.id;

      // Update shell config
      await supabase
        .from("award_shells")
        .update({
          award_level: awardLevel,
          award_category: awardCategory,
          sentences_per_statement: sentencesPerStatement,
          title: awardTitle.trim() || null,
          period_start_date: periodStartDate || null,
          period_end_date: periodEndDate || null,
        } as never)
        .eq("id", shellId);

      // Save all sections
      for (const [key, slotState] of Object.entries(slotStates)) {
        const [category, slotIndexStr] = key.split(":");
        const slotIndex = parseInt(slotIndexStr);
        const section = sections[key];

        if (section?.id?.startsWith("temp-")) {
          // Insert new section
          await supabase
            .from("award_shell_sections")
            .insert({
              shell_id: shellId,
              category,
              slot_index: slotIndex,
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              clarifying_answers: slotState.clarifyingAnswers || [],
              last_edited_by: profile.id,
            } as never);
        } else if (section) {
          // Update existing section
          await supabase
            .from("award_shell_sections")
            .update({
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              clarifying_answers: slotState.clarifyingAnswers || [],
              last_edited_by: profile.id,
            } as never)
            .eq("id", section.id);
        }

        // Mark slot as not dirty
        const [cat, idx] = key.split(":");
        updateSlotState(cat, parseInt(idx), { isDirty: false });
      }
    } catch (error) {
      console.error("Autosave error:", error);
      // Silent fail - user can still manually save
    }
  }, [nomineeInfo, profile, currentShell, isSaving, awardLevel, awardCategory, sentencesPerStatement, awardTitle, periodStartDate, periodEndDate, slotStates, sections, supabase, updateSlotState]);

  // Autosave effect - triggers 2 seconds after changes stop
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Only autosave if there are unsaved changes and dialog is open and user can edit
    if (hasUnsavedChanges && open && currentShell && canEdit) {
      autosaveTimeoutRef.current = setTimeout(() => {
        handleSilentSave();
      }, 2000); // 2 second debounce
    }

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, open, currentShell, canEdit, handleSilentSave]);

  // ============================================================================
  // Render
  // ============================================================================

  const nomineeDisplayName = nomineeInfo
    ? `${nomineeInfo.rank || ""} ${nomineeInfo.fullName || ""}`.trim()
    : "Unknown";

  return (
    <>
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
                      Rotate phone or swipe horizontally to see full statements
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
                  <Award className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold leading-tight truncate">
                    {nomineeDisplayName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {shell.award_level} • {shell.award_category} • {shell.cycle_year}
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
                        className="h-8 w-8 p-0"
                      >
                        {isSaving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        <span className="sr-only">Save</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes</TooltipContent>
                  </Tooltip>
                )}
                <FeedbackBadge
                  shellType="award"
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreviewDialog(true)}
                      disabled={totalStatementsWithContent === 0}
                      className="h-8 w-8 p-0 relative"
                    >
                      <Eye className="size-4" />
                      {totalStatementsWithContent > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-medium">
                          {totalStatementsWithContent}
                        </span>
                      )}
                      <span className="sr-only">Preview</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview ({totalStatementsWithContent} statements)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPromptSettings(true)}
                      className={cn("h-8 w-8 p-0", showPromptSettings && "bg-accent text-accent-foreground")}
                    >
                      <Settings2 className="size-4" />
                      <span className="sr-only">LLM Prompt Settings</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>LLM Prompt Settings</TooltipContent>
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
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete Award Package
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
            {/* Floating landscape hint button (shows after dismissing banner) */}
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
            <div className="w-full items-center flex justify-center">   
            <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 w-full max-w-5xl">
              {/* Award Title - Always visible and editable */}
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex-1 min-w-0">
                  {isEditingTitle && canEdit ? (
                    <Input
                      value={awardTitle}
                      onChange={(e) => setAwardTitle(e.target.value)}
                      placeholder={shell.is_team_award ? "Enter team/office name..." : "Enter award name..."}
                      className="h-9 text-sm font-medium bg-background"
                      maxLength={100}
                      autoFocus
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          setIsEditingTitle(false);
                        }
                      }}
                      aria-label="Award name"
                    />
                  ) : (
                    <div 
                      className={cn(
                        "flex items-center gap-2 min-w-0",
                        canEdit && "cursor-pointer group"
                      )}
                      onClick={() => canEdit && setIsEditingTitle(true)}
                      role={canEdit ? "button" : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (canEdit && (e.key === "Enter" || e.key === " ")) {
                          setIsEditingTitle(true);
                        }
                      }}
                    >
                      <span className={cn(
                        "text-sm font-medium truncate",
                        !awardTitle && "text-muted-foreground italic"
                      )}>
                        {awardTitle || (shell.is_team_award ? "Add team/office name..." : "Add award name...")}
                      </span>
                      {canEdit && (
                        <Pencil className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  )}
                </div>
                {/* Final Review Button */}
                {totalStatementsWithContent > 0 && (
                  <Button
                    onClick={() => setShowPreviewDialog(true)}
                    size="sm"
                    className="shrink-0"
                  >
                    <Eye className="size-4 mr-1.5" />
                    Final Review
                  </Button>
                )}
              </div>

              {/* Settings Collapsible */}
              {canEdit && (
                <Collapsible open={showConfig} onOpenChange={setShowConfig}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium">Settings</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {awardLevel} • {awardCategory}
                        </span>
                        {showConfig ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-4 grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Award Level</Label>
                        <Select
                          value={awardLevel}
                          onValueChange={(v) => setAwardLevel(v as AwardLevel)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AWARD_LEVELS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Award Category</Label>
                        <Select
                          value={awardCategory}
                          onValueChange={(v) =>
                            setAwardCategory(v as AwardCategory)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AWARD_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">AI Model</Label>
                        <ModelSelector
                          value={selectedModel}
                          onValueChange={setSelectedModel}
                          compact
                        />
                      </div>
                    </div>

                    {/* Award Period Date Range */}
                    <div className="pt-4 space-y-2">
                      <Label className="text-xs flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        Award Period
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Start Date</Label>
                          <Input
                            type="date"
                            value={periodStartDate}
                            onChange={(e) => setPeriodStartDate(e.target.value)}
                            className="h-9 text-sm"
                            aria-label="Award period start date"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">End Date</Label>
                          <Input
                            type="date"
                            value={periodEndDate}
                            onChange={(e) => setPeriodEndDate(e.target.value)}
                            className="h-9 text-sm"
                            min={periodStartDate || undefined}
                            aria-label="Award period end date"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Used to filter accomplishments during statement generation
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-4">
                      <Button variant="ghost" size="sm" onClick={expandAll}>
                        Expand All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={collapseAll}>
                        Collapse All
                      </Button>
                    </div>
                    
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Loading State */}
              {isLoadingShell ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : (
                /* Category Sections */
                <div className="space-y-4">
                  {AWARD_1206_CATEGORIES.map((cat) => {
                    const categorySections = getSectionsForCategory(cat.key);

                    return (
                      <AwardCategorySectionCard
                        key={cat.key}
                        categoryKey={cat.key}
                        categoryLabel={cat.label}
                        categoryHeading={cat.heading}
                        categoryDescription={cat.description}
                        sections={categorySections}
                        accomplishments={accomplishments}
                        nomineeId={nomineeInfo?.id || ""}
                        nomineeRank={nomineeInfo?.rank || ""}
                        nomineeName={nomineeInfo?.fullName || ""}
                        nomineeAfsc={nomineeInfo?.afsc || ""}
                        awardLevel={awardLevel}
                        awardCategory={awardCategory}
                        model={selectedModel}
                        periodStartDate={periodStartDate || null}
                        periodEndDate={periodEndDate || null}
                        isCollapsed={collapsedCategories[cat.key] || false}
                        onToggleCollapse={() => toggleCategoryCollapsed(cat.key)}
                        onUpdateSlotState={updateSlotState}
                        onAddSection={() => addSection(cat.key)}
                        onRemoveSection={(slotIndex) =>
                          removeSection(cat.key, slotIndex)
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog - Unified editable view like AF Form 1206 */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent style={{ maxWidth: '860px', width: '100%' }} className="max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="size-5" />
              AF Form 1206 Preview
            </DialogTitle>
            <DialogDescription>
              Make any final edits, then copy to your AF Form 1206
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 py-2 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {previewText.trim() === "" ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-center text-muted-foreground py-8">
                  No statements generated yet. Add content to the category
                  sections above.
                </p>
              </div>
            ) : (
              <div 
                className="border border-input rounded-md bg-muted/30 p-2"
                style={{ width: 'fit-content' }}
              >
                <textarea
                  value={toDisplayText(previewText)}
                  onChange={(e) => setPreviewText(fromDisplayText(e.target.value))}
                  onCopy={(e) => {
                    // Ensure clipboard gets regular hyphens, not non-breaking hyphens,
                    // so pasting into the actual 1206 PDF uses standard characters.
                    const selection = window.getSelection()?.toString();
                    if (selection) {
                      e.preventDefault();
                      e.clipboardData.setData('text/plain', fromDisplayText(selection));
                    }
                  }}
                  className="bg-transparent focus:outline-none resize-none block"
                  style={{
                    width: '765.95px',
                    minWidth: '765.95px',
                    maxWidth: '765.95px',
                    minHeight: '500px',
                    fontFamily: '"Times New Roman", Times, serif',
                    fontSize: '12pt',
                    lineHeight: '24px',
                    padding: 0,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    // Disable kerning and ligatures to match AF Form 1206 PDF rendering.
                    // The PDF form fields do not apply kerning, so character pairs like
                    // "Vo" have uniform spacing. Disabling these also fixes accumulated
                    // width errors with repeating characters (e.g., long runs of periods).
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                    fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0',
                  }}
                  placeholder="Your statements will appear here..."
                  aria-label="AF Form 1206 statements preview"
                />
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPreviewDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={handleCopyAll}
              disabled={previewText.trim() === ""}
            >
              {copiedAll ? (
                <>
                  <Check className="size-4 mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {currentShell && (
        <AwardShellShareDialog
          shellId={currentShell.id}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          nominee={{
            id: nomineeInfo?.id || "",
            fullName: nomineeInfo?.fullName || null,
            rank: nomineeInfo?.rank || null,
            afsc: nomineeInfo?.afsc || null,
            isManagedMember: nomineeInfo?.isManagedMember || false,
          }}
          currentUserId={profile?.id}
        />
      )}

      {/* Review Link Dialog - For mentor feedback */}
      {currentShell && (
        <CreateReviewLinkDialog
          open={showReviewLinkDialog}
          onOpenChange={setShowReviewLinkDialog}
          shellType="award"
          shellId={currentShell.id}
          rateeName={nomineeInfo?.fullName || "Unknown"}
          rateeRank={nomineeInfo?.rank || undefined}
          contentSnapshot={{
            title: currentShell.title || AWARD_CATEGORIES.find((c) => c.value === currentShell.award_category)?.label || currentShell.award_category,
            cycleYear: currentShell.cycle_year,
            sections: Object.entries(slotStates).map(([key, state]) => {
              const category = key.split(":")[0];
              return {
                key: category,
                label: AWARD_1206_CATEGORIES.find((c) => c.key === category)?.label || category,
                content: state.draftText,
              };
            }),
          }}
        />
      )}

      {/* Feedback List Dialog */}
      {currentShell && (
        <FeedbackListDialog
          open={showFeedbackListDialog}
          onOpenChange={setShowFeedbackListDialog}
          shellType="award"
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
          shellType="award"
          shellId={currentShell.id}
          onBack={() => {
            setShowFeedbackViewerDialog(false);
            setShowFeedbackListDialog(true);
            setFeedbackBadgeRefreshKey(k => k + 1);
          }}
          onApplySuggestion={handleApplySuggestion}
          getCurrentText={(sectionKey) => {
            // Find the slot key that matches this section category
            const matchingSlotKey = Object.keys(slotStates).find(key => key.startsWith(`${sectionKey}:`));
            return matchingSlotKey ? slotStates[matchingSlotKey].draftText : "";
          }}
        />
      )}

      {/* Delete Award Dialog */}
      {currentShell && (
        <DeleteAwardDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          shellId={currentShell.id}
          nomineeName={nomineeDisplayName}
          awardLevel={awardLevel}
          awardCategory={awardCategory}
          slotStates={slotStates}
          onDeleteComplete={handleDeleteComplete}
        />
      )}

      {/* Award Prompt Settings Modal - independent from EPB */}
      <AwardPromptSettingsModal
        open={showPromptSettings}
        onOpenChange={setShowPromptSettings}
        nomineeRank={nomineeInfo?.rank}
      />

      {/* AI Model Survey - one-time */}
      <AiModelSurveyModal
        open={aiSurvey.showSurvey}
        onOpenChange={aiSurvey.onOpenChange}
        sourcePage={aiSurvey.sourcePage}
      />
    </>
  );
}

