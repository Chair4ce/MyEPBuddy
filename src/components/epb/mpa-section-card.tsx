"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// IMPORTANT: Not using shadcn Button, Switch, Progress, Label to avoid Radix ref composition issues
// Using native HTML elements instead
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// Collapsible removed - caused ref loop issues with asChild pattern
// Popover removed - caused ref loop issues with asChild pattern
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { STANDARD_MGAS, MAX_STATEMENT_CHARACTERS, MAX_HLR_CHARACTERS } from "@/lib/constants";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  Crown,
  History,
  RotateCcw,
  Zap,
  FileText,
  Camera,
  Plus,
  RefreshCw,
  Lock,
  CheckCircle2,
  Circle,
  Bookmark,
  BookMarked,
  Trash2,
  Users,
  Rows2,
} from "lucide-react";
import { useEPBShellStore, type MPAWorkspaceMode, type SourceType } from "@/stores/epb-shell-store";
import { LoadedActionCard } from "./loaded-action-card";
import { ActionSelectorSheet } from "./action-selector-sheet";
import { SentencePills, type DraggedSentence } from "./sentence-pills";
import { SentenceDropOverlay } from "./sentence-drop-overlay";
import { SplitViewEditor } from "./split-view-editor";
// Per-section collaboration removed - using page-level collaboration instead
import type { EPBShellSection, EPBShellSnapshot, EPBSavedExample, Accomplishment } from "@/types/database";
import { useStyleFeedback, getMpaCategory } from "@/hooks/use-style-feedback";
import { ClarifyingQuestionsIndicator, ClarifyingQuestionsModal } from "@/components/generate/clarifying-questions-modal";
import { useClarifyingQuestionsStore } from "@/stores/clarifying-questions-store";

interface MPASectionCardProps {
  section: EPBShellSection;
  /** Ratee ID for clarifying questions feature */
  rateeId?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onCreateSnapshot: (text: string) => Promise<void>;
  onGenerateStatement: (options: GenerateOptions) => Promise<string[]>;
  onReviseStatement: (text: string, context?: string, versionCount?: number, aggressiveness?: number, fillToMax?: boolean) => Promise<string[]>;
  snapshots: EPBShellSnapshot[];
  accomplishments: Accomplishment[]; // All available accomplishments
  onOpenAccomplishments: () => void;
  enableAutosave?: boolean;
  autosaveDelayMs?: number;
  cycleYear: number;
  // Section lock props (for single-user mode)
  isLockedByOther?: boolean;
  lockedByInfo?: { name: string; rank: string | null } | null;
  onAcquireLock?: () => Promise<{ success: boolean; lockedBy?: string }>;
  onReleaseLock?: () => Promise<void>;
  // Collaboration mode - sync text to Zustand more frequently
  isCollaborating?: boolean;
  // Refresh callback to get latest data
  onRefresh?: () => Promise<void>;
  // Completion toggle
  onToggleComplete?: () => void;
  // Highlight pulse animation when scrolled to
  isHighlighted?: boolean;
  // Saved examples (scratchpad)
  savedExamples?: EPBSavedExample[];
  onSaveExample?: (text: string, note?: string) => Promise<void>;
  onDeleteExample?: (id: string) => Promise<void>;
  // Sentence drag-drop
  onSentenceDragStart?: (data: DraggedSentence) => void;
  onSentenceDragEnd?: () => void;
  onSentenceDrop?: (data: DraggedSentence, targetMpa: string, targetIndex: number) => void;
  draggedSentence?: DraggedSentence | null;
  // Split view mode
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
  // HLR-specific: EPB statements count for "Use EPB" source option
  epbStatementsCount?: number;
}

interface GenerateOptions {
  useAccomplishments: boolean;
  accomplishmentIds?: string[];
  customContext?: string;
  usesTwoStatements: boolean;
  statement1Context?: string;
  statement2Context?: string;
  versionCount?: number;
  // HLR-specific: use all EPB statements to generate holistic assessment
  useEPBStatements?: boolean;
  // Clarifying context from user answers (for regeneration with enhanced details)
  clarifyingContext?: string;
}

// Get MPA display info
function getMPAInfo(mpaKey: string) {
  const mpa = STANDARD_MGAS.find((m) => m.key === mpaKey);
  const isHLR = mpaKey === "hlr_assessment";
  const maxChars = isHLR ? MAX_HLR_CHARACTERS : MAX_STATEMENT_CHARACTERS;
  return { mpa, isHLR, maxChars };
}

// Source toggle component (2 options for regular MPAs)
function SourceToggle({
  sourceType,
  onSourceChange,
  actionsCount,
}: {
  sourceType: SourceType;
  onSourceChange: (source: SourceType) => void;
  actionsCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 border">
      <button
        onClick={() => onSourceChange("actions")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm transition-all",
          sourceType === "actions"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Zap className="size-3.5 sm:size-4" />
        <span className="font-medium hidden sm:inline">Performance Actions</span>
        <span className="font-medium sm:hidden">Actions</span>
        {actionsCount > 0 && sourceType === "actions" && (
          <Badge variant="secondary" className="text-[9px] sm:text-[10px] bg-primary-foreground/20">
            {actionsCount}
          </Badge>
        )}
      </button>
      <button
        onClick={() => onSourceChange("custom")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm transition-all",
          sourceType === "custom"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <FileText className="size-3.5 sm:size-4" />
        <span className="font-medium hidden sm:inline">Custom Context</span>
        <span className="font-medium sm:hidden">Custom</span>
      </button>
    </div>
  );
}

// HLR-specific source toggle with 3 options (includes EPB Summary)
function HLRSourceToggle({
  sourceType,
  onSourceChange,
  actionsCount,
  epbStatementsCount,
}: {
  sourceType: SourceType;
  onSourceChange: (source: SourceType) => void;
  actionsCount: number;
  epbStatementsCount: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-1.5 sm:p-2 rounded-lg bg-muted/30 border">
      {/* Top row: Actions and Custom */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onSourceChange("actions")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 sm:gap-2 py-1.5 px-2 sm:px-3 rounded-md text-xs sm:text-sm transition-all",
            sourceType === "actions"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Zap className="size-3.5 sm:size-4" />
          <span className="font-medium hidden sm:inline">Actions</span>
          <span className="font-medium sm:hidden">Actions</span>
          {actionsCount > 0 && sourceType === "actions" && (
            <Badge variant="secondary" className="text-[9px] sm:text-[10px] bg-primary-foreground/20">
              {actionsCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => onSourceChange("custom")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 sm:gap-2 py-1.5 px-2 sm:px-3 rounded-md text-xs sm:text-sm transition-all",
            sourceType === "custom"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <FileText className="size-3.5 sm:size-4" />
          <span className="font-medium hidden sm:inline">Custom</span>
          <span className="font-medium sm:hidden">Custom</span>
        </button>
      </div>
      {/* Bottom row: EPB Summary (full width, highlighted for HLR) */}
      <button
        onClick={() => onSourceChange("epb-summary")}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-3 rounded-md text-xs sm:text-sm transition-all",
          sourceType === "epb-summary"
            ? "bg-amber-600 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-300/50 dark:border-amber-700/50"
        )}
      >
        <Crown className="size-3.5 sm:size-4" />
        <span className="font-medium">Use EPB Statements</span>
        {epbStatementsCount > 0 && (
          <Badge 
            variant="secondary" 
            className={cn(
              "text-[9px] sm:text-[10px]",
              sourceType === "epb-summary" ? "bg-white/20" : "bg-amber-200/50 dark:bg-amber-800/50"
            )}
          >
            {epbStatementsCount} MPAs
          </Badge>
        )}
      </button>
    </div>
  );
}

// Default section state (for use when store state is undefined)
const DEFAULT_SECTION_STATE = {
  mode: "edit" as MPAWorkspaceMode, // Default to edit mode - statement always visible at top
  draftText: "",
  isDirty: false,
  isGenerating: false,
  isRevising: false,
  isSaving: false,
  showHistory: false,
  sourceType: "actions" as SourceType,
  statement1ActionIds: [] as string[],
  statement2ActionIds: [] as string[],
  actionsExpanded: true,
  usesTwoStatements: true, // Default to two statements
  statement1Context: "",
  statement2Context: "",
  selectedAccomplishmentIds: [] as string[],
};

export function MPASectionCard({
  section,
  rateeId,
  isCollapsed,
  onToggleCollapse,
  onSave,
  onCreateSnapshot,
  onGenerateStatement,
  onReviseStatement,
  snapshots,
  accomplishments,
  onOpenAccomplishments,
  enableAutosave = true,
  autosaveDelayMs = 2000,
  cycleYear,
  // Lock props for single-user mode
  isLockedByOther = false,
  lockedByInfo,
  onAcquireLock,
  onReleaseLock,
  // Collaboration mode
  isCollaborating = false,
  // Refresh callback
  onRefresh,
  // Completion toggle
  onToggleComplete,
  // Highlight pulse
  isHighlighted = false,
  // Saved examples
  savedExamples = [],
  onSaveExample,
  onDeleteExample,
  // Sentence drag-drop
  onSentenceDragStart,
  onSentenceDragEnd,
  onSentenceDrop,
  draggedSentence,
  // Split view
  isSplitView = false,
  onToggleSplitView,
  // HLR-specific
  epbStatementsCount = 0,
}: MPASectionCardProps) {
  const { mpa, isHLR, maxChars } = getMPAInfo(section.mpa);
  
  // Subscribe to the specific section state from the store
  const sectionStates = useEPBShellStore((s) => s.sectionStates);
  const storedState = sectionStates[section.mpa];
  const updateSectionState = useEPBShellStore((s) => s.updateSectionState);
  const initializeSectionState = useEPBShellStore((s) => s.initializeSectionState);
  
  // Get active clarifying question set for modal rendering
  const activeQuestionSet = useClarifyingQuestionsStore((s) => s.getActiveQuestionSet());
  
  // Use local ref for autosave timer to avoid Zustand updates on every keystroke
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use stored state or defaults
  const state = storedState || DEFAULT_SECTION_STATE;
  
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSplitViewClosing, setIsSplitViewClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(section.statement_text);
  
  // Revise panel state
  const [showRevisePanel, setShowRevisePanel] = useState(false);
  const [reviseVersionCount, setReviseVersionCount] = useState(3);
  const [reviseContext, setReviseContext] = useState("");
  const [reviseAggressiveness, setReviseAggressiveness] = useState(50);
  const [reviseFillToMax, setReviseFillToMax] = useState(true);
  const [generatedRevisions, setGeneratedRevisions] = useState<string[]>([]);
  const [isRevising, setIsRevising] = useState(false);
  
  // AI Generate panel state
  const [generateVersionCount, setGenerateVersionCount] = useState(3);
  const [generatedStatements, setGeneratedStatements] = useState<string[]>([]);
  
  // Saved examples panel state
  const [showExamples, setShowExamples] = useState(false);
  
  // Style learning feedback (non-blocking, fire-and-forget)
  const styleFeedback = useStyleFeedback();
  const mpaCategory = getMpaCategory(section.mpa);
  const [isSavingExample, setIsSavingExample] = useState(false);
  
  // Refs for scrolling panels into view
  const aiGeneratePanelRef = useRef<HTMLDivElement>(null);
  const revisePanelRef = useRef<HTMLDivElement>(null);
  
  // LOCAL state for textarea - initialized from section prop (source of truth)
  // This prevents constant re-renders during typing which causes ref composition loops
  const [localText, setLocalText] = useState(section.statement_text || "");
  
  // Track if user is currently focused on the textarea
  const [isEditing, setIsEditing] = useState(false);
  // Store the original text when user starts editing (for snapshot on focus loss)
  const originalTextOnFocusRef = useRef<string>("");
  // Track if component is mounted to prevent blur handler from running after unmount
  const isMountedRef = useRef(true);
  
  // Set unmount flag
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Page visibility detection - save and release lock when user leaves the page
  // This is more reliable than idle detection for preventing long lock holds
  useEffect(() => {
    if (!isEditing || isCollaborating) return;
    
    const handleVisibilityChange = async () => {
      if (document.hidden && isEditing && textareaRef.current) {
        // Page is now hidden while user was editing
        // Snapshot the original text if it's different from current
        const originalText = originalTextOnFocusRef.current;
        if (originalText && originalText !== localText && originalText.trim().length > 0) {
          try {
            await onCreateSnapshot(originalText);
          } catch (err) {
            console.error("Failed to create snapshot on page hide:", err);
          }
        }
        
        // Blur to trigger save + lock release (silently)
        textareaRef.current.blur();
      }
    };
    
    const handleWindowBlur = async () => {
      // Window lost focus (user switched apps/tabs)
      if (isEditing && textareaRef.current) {
        // Small delay to avoid triggering on brief focus switches (like opening dev tools)
        const blurTimer = setTimeout(async () => {
          if (!document.hasFocus() && isEditing && textareaRef.current) {
            // Snapshot original if different
            const originalText = originalTextOnFocusRef.current;
            if (originalText && originalText !== localText && originalText.trim().length > 0) {
              try {
                await onCreateSnapshot(originalText);
              } catch (err) {
                console.error("Failed to create snapshot on window blur:", err);
              }
            }
            
            // Blur to trigger save + lock release (silently)
            textareaRef.current?.blur();
          }
        }, 500); // 500ms grace period
        
        return () => clearTimeout(blurTimer);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isEditing, isCollaborating, localText, onCreateSnapshot]);

  // Get loaded actions
  const statement1Actions = useMemo(() => 
    accomplishments.filter((a) => state.statement1ActionIds.includes(a.id)),
    [accomplishments, state.statement1ActionIds]
  );
  const statement2Actions = useMemo(() => 
    accomplishments.filter((a) => state.statement2ActionIds.includes(a.id)),
    [accomplishments, state.statement2ActionIds]
  );
  const totalLoadedActions = statement1Actions.length + statement2Actions.length;

  // Filter accomplishments for this MPA
  const mpaAccomplishments = useMemo(() => 
    accomplishments.filter((a) => a.mpa === section.mpa || section.mpa === "hlr_assessment"),
    [accomplishments, section.mpa]
  );

  // Sync local text with section.statement_text when it changes (from shell load or realtime)
  // This is the source of truth - always sync unless user is actively editing
  useEffect(() => {
    const isFocused = document.activeElement === textareaRef.current;
    if (!isFocused) {
      setLocalText(section.statement_text || "");
      initializeSectionState(section.mpa, section.statement_text || "");
      lastSavedRef.current = section.statement_text || "";
    }
  }, [section.statement_text, section.mpa, initializeSectionState]);

  // Also sync when state.draftText changes from external sources (AI generation, collaboration)
  useEffect(() => {
    const isFocused = document.activeElement === textareaRef.current;
    if (!isFocused && state.draftText !== localText) {
      setLocalText(state.draftText);
    }
  }, [state.draftText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave functionality
  const performAutosave = useCallback(async (text: string) => {
    if (!enableAutosave) return;
    if (text === lastSavedRef.current) return;
    if (text.length > maxChars) return;
    
    setIsAutosaving(true);
    try {
      await onSave(text);
      lastSavedRef.current = text;
      updateSectionState(section.mpa, { isDirty: false });
    } catch (error) {
      console.error("Autosave failed:", error);
    } finally {
      setIsAutosaving(false);
    }
  }, [enableAutosave, maxChars, onSave, section.mpa, updateSectionState]);

  // Debounced autosave effect - uses localText when editing
  // Uses local ref for timer to avoid Zustand updates on every keystroke
  useEffect(() => {
    if (!enableAutosave) return;
    if (state.mode !== "edit") return;
    if (localText === lastSavedRef.current) return;
    
    // Clear existing timer using local ref (no Zustand update)
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    
    // Set new timer using local ref
    autosaveTimerRef.current = setTimeout(() => {
      performAutosave(localText);
      autosaveTimerRef.current = null;
    }, autosaveDelayMs);
    
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [localText, state.mode, enableAutosave, autosaveDelayMs, performAutosave]);

  // Always use localText for character counting since that's what's in the textarea
  const charCount = localText.length;
  const isOverLimit = charCount > maxChars;
  const hasContent = localText.trim().length > 0;
  const hasUnsavedChanges = localText !== section.statement_text;

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(localText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Save changes - use localText if in edit mode
  const handleSave = async () => {
    const textToSave = state.mode === "edit" ? localText : state.draftText;
    if (textToSave.length > maxChars) {
      toast.error(`Statement exceeds ${maxChars} character limit`);
      return;
    }
    // Sync local text to store first
    if (state.mode === "edit") {
      updateSectionState(section.mpa, { draftText: localText });
    }
    updateSectionState(section.mpa, { isSaving: true });
    try {
      await onSave(textToSave);
      updateSectionState(section.mpa, { isDirty: false });
      toast.success("Statement saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save");
    } finally {
      updateSectionState(section.mpa, { isSaving: false });
    }
  };

  // Create snapshot instantly
  const handleCreateSnapshot = async () => {
    if (isCreatingSnapshot || !hasContent) return;
    setIsCreatingSnapshot(true);
    try {
      await onCreateSnapshot(state.draftText);
      toast.success("Snapshot saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save snapshot");
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Restore from snapshot
  const handleRestoreSnapshot = (snapshot: EPBShellSnapshot) => {
    updateSectionState(section.mpa, {
      draftText: snapshot.statement_text,
      isDirty: true,
    });
    setShowHistory(false);
    toast.success("Restored from snapshot");
  };

  // Ref for collaboration sync timer
  const collabSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle text change - UPDATE LOCAL STATE ONLY normally
  // In collaboration mode, also debounce sync to Zustand for real-time sharing
  const handleTextChange = (value: string) => {
    setLocalText(value);
    
    // In collaboration mode, debounce sync to Zustand (300ms)
    if (isCollaborating) {
      if (collabSyncTimerRef.current) {
        clearTimeout(collabSyncTimerRef.current);
      }
      collabSyncTimerRef.current = setTimeout(() => {
        updateSectionState(section.mpa, {
          draftText: value,
          isDirty: value !== section.statement_text,
        });
        collabSyncTimerRef.current = null;
      }, 300);
    }
  };

  // Set presence when textarea gains focus (no blocking, collaborative editing)
  const handleTextFocus = async () => {
    // Store the original text before editing begins (for idle snapshot)
    originalTextOnFocusRef.current = localText;
    
    // Mark as editing IMMEDIATELY (enables idle detection)
    setIsEditing(true);
    
    // Set presence indicator (doesn't block other users)
    if (onAcquireLock && !isCollaborating) {
      await onAcquireLock();
    }
  };

  // Sync local text to Zustand on blur, save, and release lock
  const handleTextBlur = async () => {
    // Don't update state if component is unmounting (e.g., during member switch)
    if (!isMountedRef.current) return;
    
    // Mark as no longer editing (disables idle detection)
    setIsEditing(false);
    
    // Clear any pending collab sync
    if (collabSyncTimerRef.current) {
      clearTimeout(collabSyncTimerRef.current);
      collabSyncTimerRef.current = null;
    }
    
    // Update Zustand state
    updateSectionState(section.mpa, {
      draftText: localText,
      isDirty: localText !== section.statement_text,
    });
    
    // Auto-save if there are changes
    if (localText !== section.statement_text) {
      try {
        await onSave(localText);
        lastSavedRef.current = localText;
      } catch {
        // Save failed - changes will persist in local state
        console.error("Auto-save on blur failed");
      }
    }
    
    // Release lock when leaving the field
    if (onReleaseLock && !isCollaborating) {
      await onReleaseLock();
    }
    
    // Clear the original text ref
    originalTextOnFocusRef.current = "";
  };

  // Cleanup collab sync timer on unmount
  useEffect(() => {
    return () => {
      if (collabSyncTimerRef.current) {
        clearTimeout(collabSyncTimerRef.current);
      }
    };
  }, []);

  // Handle refresh - get latest data from database
  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      // Update local text with the latest from section
      setLocalText(section.statement_text);
      updateSectionState(section.mpa, {
        draftText: section.statement_text,
        isDirty: false,
      });
      toast.success("Refreshed to latest version");
    } catch (err) {
      console.error("Failed to refresh:", err);
      toast.error("Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle mode change - with lock acquisition in single-user mode
  const handleModeChange = async (newMode: MPAWorkspaceMode) => {
    // If entering edit or ai-assist mode, try to acquire lock (if lock function provided)
    if ((newMode === "edit" || newMode === "ai-assist") && onAcquireLock) {
      const result = await onAcquireLock();
      if (!result.success) {
        toast.error(`This section is locked`, {
          description: `${result.lockedBy || "Another user"} is currently editing`,
        });
        return; // Don't change mode
      }
    }
    
    // If leaving edit/ai-assist mode, release lock
    if ((state.mode === "edit" || state.mode === "ai-assist") && newMode === "view" && onReleaseLock) {
      await onReleaseLock();
    }
    
    updateSectionState(section.mpa, { mode: newMode });
  };


  // Reset to saved version
  const handleReset = () => {
    updateSectionState(section.mpa, {
      draftText: section.statement_text,
      isDirty: false,
    });
  };

  // Generate statement with AI
  const handleGenerate = async () => {
    updateSectionState(section.mpa, { isGenerating: true });
    setGeneratedStatements([]);
    try {
      // Combine action IDs from both statements
      const allActionIds = state.usesTwoStatements
        ? [...state.statement1ActionIds, ...state.statement2ActionIds]
        : state.statement1ActionIds;
      
      const results = await onGenerateStatement({
        useAccomplishments: state.sourceType === "actions" && allActionIds.length > 0,
        accomplishmentIds: allActionIds,
        customContext: state.sourceType === "custom" ? state.statement1Context : undefined,
        usesTwoStatements: state.usesTwoStatements,
        statement1Context: state.statement1Context,
        statement2Context: state.statement2Context,
        versionCount: generateVersionCount,
        // HLR-specific: use EPB statements when source type is "epb-summary"
        useEPBStatements: state.sourceType === "epb-summary" && isHLR,
      });
      if (results.length > 0) {
        setGeneratedStatements(results);
      } else {
        toast.error("No statements generated");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate statement");
    } finally {
      updateSectionState(section.mpa, { isGenerating: false });
    }
  };
  
  // Use a generated statement (replace current statement)
  const handleUseStatement = (statement: string) => {
    setLocalText(statement);
    updateSectionState(section.mpa, {
      draftText: statement,
      isDirty: true,
    });
    setGeneratedStatements([]);
    toast.success("Statement applied");
  };
  
  // Save a statement to the examples scratchpad
  const handleSaveToExamples = async (statement: string, note?: string) => {
    if (!onSaveExample) return;
    setIsSavingExample(true);
    try {
      await onSaveExample(statement, note);
      toast.success("Saved to examples");
    } catch {
      toast.error("Failed to save example");
    } finally {
      setIsSavingExample(false);
    }
  };

  // Generate revisions with AI (for revise panel)
  const handleGenerateRevisions = async () => {
    if (!localText.trim()) {
      toast.error("No text to revise");
      return;
    }
    setIsRevising(true);
    setGeneratedRevisions([]);
    try {
      const revisions = await onReviseStatement(localText, reviseContext || undefined, reviseVersionCount, reviseAggressiveness, reviseFillToMax);
      if (revisions.length > 0) {
        setGeneratedRevisions(revisions);
      } else {
        toast.error("No revisions generated");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate revisions");
    } finally {
      setIsRevising(false);
    }
  };
  
  // Cancel revise panel
  const handleCancelRevise = () => {
    setShowRevisePanel(false);
    setGeneratedRevisions([]);
    setReviseContext("");
  };
  
  // Use a generated revision (replace current statement)
  const handleUseRevision = (revision: string, versionIndex: number) => {
    setLocalText(revision);
    updateSectionState(section.mpa, {
      draftText: revision,
      isDirty: true,
    });
    setShowRevisePanel(false);
    setGeneratedRevisions([]);
    setReviseContext("");
    toast.success("Revision applied");
    
    // Track for style learning (fire-and-forget)
    styleFeedback.trackRevisionSelected({
      version: versionIndex + 1,
      totalVersions: generatedRevisions.length,
      charCount: revision.length,
      category: mpaCategory,
      aggressiveness: reviseAggressiveness,
      fillToMax: reviseFillToMax,
    });
  };

  // Handle action selection for statement 1
  const handleStatement1ActionsChange = (ids: string[]) => {
    updateSectionState(section.mpa, { statement1ActionIds: ids });
  };

  // Handle action selection for statement 2
  const handleStatement2ActionsChange = (ids: string[]) => {
    updateSectionState(section.mpa, { statement2ActionIds: ids });
  };

  // Remove action from statement 1
  const removeStatement1Action = (id: string) => {
    updateSectionState(section.mpa, {
      statement1ActionIds: state.statement1ActionIds.filter((i) => i !== id),
    });
  };

  // Remove action from statement 2
  const removeStatement2Action = (id: string) => {
    updateSectionState(section.mpa, {
      statement2ActionIds: state.statement2ActionIds.filter((i) => i !== id),
    });
  };

  // Check if we can generate
  const canGenerate = state.sourceType === "actions"
    ? (state.statement1ActionIds.length > 0 || (state.usesTwoStatements && state.statement2ActionIds.length > 0))
    : state.sourceType === "epb-summary"
      ? epbStatementsCount > 0
      : state.statement1Context.trim().length > 0;

  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden",
        "border-primary-300/30 dark:border-primary-700/30 bg-background dark:bg-muted/30",
        isHLR && "border-primary-300/30 dark:border-primary-700/30",
        hasUnsavedChanges && "ring-1 ring-amber-400/50",
        section.is_complete && "border-green-500/30 bg-green-50/30 dark:bg-green-900/10",
        isHighlighted && "animate-pulse-highlight"
      )}
    >
      {/* Header - NO Collapsible/Radix components to avoid ref issues */}
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <button 
            className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 text-left group"
            onClick={onToggleCollapse}
          >
            {isHLR && <Crown className="size-4 sm:size-5 text-amber-600 shrink-0" />}
            <span className="font-semibold text-base sm:text-lg truncate">
              {mpa?.label || section.mpa}
            </span>
            {/* Presence indicator for collaborative editing - hide on mobile */}
            {isLockedByOther && lockedByInfo && (
              <Badge
                variant="outline"
                className="text-[9px] sm:text-[10px] shrink-0 text-muted-foreground border-border gap-0.5 sm:gap-1 hidden sm:flex"
                title={`${lockedByInfo.rank || ""} ${lockedByInfo.name} is also editing this section`}
              >
                <Users className="size-2.5 sm:size-3" />
                <span className="hidden md:inline">{lockedByInfo.rank || ""} {lockedByInfo.name.split(" ")[0]} editing</span>
                <span className="md:hidden">Collab</span>
              </Badge>
            )}
            {/* Mobile lock indicator */}
            {isLockedByOther && (
              <Lock className="size-3 text-amber-600 shrink-0 sm:hidden" />
            )}
            {isAutosaving && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] text-blue-600 border-blue-600/30 shrink-0 animate-pulse px-1 sm:px-1.5">
                <span className="hidden sm:inline">Saving...</span>
                <span className="sm:hidden">...</span>
              </Badge>
            )}
            {hasUnsavedChanges && !isAutosaving && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] text-amber-600 border-amber-600/30 shrink-0 px-1 sm:px-1.5">
                <span className="hidden sm:inline">{enableAutosave ? "Editing..." : "Unsaved"}</span>
                <span className="sm:hidden">*</span>
              </Badge>
            )}
            {isCollapsed ? (
              <ChevronDown className="size-3.5 sm:size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            ) : (
              <ChevronUp className="size-3.5 sm:size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            )}
          </button>
          {/* Split view toggle button - only for non-HLR sections */}
          {!isHLR && onToggleSplitView && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-md size-6 shrink-0 transition-colors",
                    isSplitView
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    // If closing split view, animate first then toggle
                    if (isSplitView && !isSplitViewClosing) {
                      setIsSplitViewClosing(true);
                      // Wait for close animation to complete (300ms)
                      setTimeout(() => {
                        setIsSplitViewClosing(false);
                        onToggleSplitView();
                      }, 300);
                    } else if (!isSplitView) {
                      onToggleSplitView();
                    }
                  }}
                  disabled={isSplitViewClosing}
                >
                  <Rows2 className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isSplitView ? "Combined view" : "Split view (S1 & S2)"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {/* Completion toggle button */}
          {onToggleComplete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-md size-6 shrink-0 transition-colors",
                    section.is_complete
                      ? "text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete();
                  }}
                >
                  {section.is_complete ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{section.is_complete ? "Mark as incomplete" : "Mark as complete"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {/* Copy button */}
          {isCollapsed && hasContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex items-center justify-center rounded-md size-6 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? "Copied!" : "Copy to clipboard"}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {isCollapsed && hasContent && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-1 pl-6">
            {state.draftText.slice(0, 100)}...
          </p>
        )}
      </CardHeader>

      {/* Content - conditionally rendered instead of using Collapsible */}
      {!isCollapsed && (
        <CardContent className="pt-0 space-y-3 sm:space-y-4 animate-in slide-in-from-top-2 duration-200 px-3 sm:px-6">
            {/* Working Statement Area - ALWAYS at top */}
            <div className="space-y-3">
              {/* Presence indicator - shows who else is editing (collaborative) */}
              {isLockedByOther && lockedByInfo && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-muted-foreground text-xs animate-in fade-in-0 duration-200">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex size-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-muted-foreground/50 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-1.5 bg-muted-foreground"></span>
                    </span>
                    <span>
                      {lockedByInfo.rank ? `${lockedByInfo.rank} ${lockedByInfo.name}` : lockedByInfo.name} is also editing
                    </span>
                  </div>
                </div>
              )}

              {/* Textarea or Split View Editor */}
              {isSplitView && !isHLR ? (
                <SplitViewEditor
                  text={localText}
                  onChange={handleTextChange}
                  maxChars={maxChars}
                  disabled={isLockedByOther}
                  placeholder={`Enter your ${mpa?.label || "statement"} here...`}
                  mpaKey={section.mpa}
                  onDragStart={onSentenceDragStart}
                  onDragEnd={onSentenceDragEnd}
                  onDrop={(data, targetIndex) => onSentenceDrop?.(data, section.mpa, targetIndex)}
                  draggedSentence={draggedSentence}
                  isClosing={isSplitViewClosing}
                />
              ) : (
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={localText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onFocus={handleTextFocus}
                    onBlur={handleTextBlur}
                    placeholder={`Enter your ${mpa?.label || "statement"} here...`}
                    rows={5}
                    className={cn(
                      "flex w-full rounded-md border-2 border-border/60 bg-transparent px-3 py-2 text-sm shadow-sm ring-1 ring-ring/10 transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                      isOverLimit && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  
                  {/* Drop overlay - shows when dragging a sentence from another MPA */}
                  {!isHLR && !isLockedByOther && (
                    <SentenceDropOverlay
                      statementText={localText}
                      mpaKey={section.mpa}
                      draggedSentence={draggedSentence ?? null}
                      onDrop={(data, targetIndex) => onSentenceDrop?.(data, section.mpa, targetIndex)}
                    />
                  )}
                </div>
              )}
              
              {/* Action bar below textarea - hidden in split view */}
              {!isSplitView && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                      {charCount}/{maxChars}
                    </span>
                    
                    {/* Inline Sentence Pills for drag-drop swap */}
                    {!isHLR && (hasContent || draggedSentence) && (
                      <SentencePills
                        statementText={localText}
                        mpaKey={section.mpa}
                        mpaLabel={mpa?.label || section.mpa}
                        maxChars={maxChars}
                        onDragStart={onSentenceDragStart}
                        onDragEnd={onSentenceDragEnd}
                        onDrop={(data, targetIndex) => onSentenceDrop?.(data, section.mpa, targetIndex)}
                        draggedSentence={draggedSentence}
                        disabled={isLockedByOther}
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {hasUnsavedChanges && (
                      <button 
                        onClick={handleReset} 
                        className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                      >
                        <RotateCcw className="size-3 mr-1" />
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                    )}
                    <button 
                      onClick={handleCopy} 
                      disabled={!hasContent}
                      className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {copied ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                      <span className="hidden sm:inline">Copy</span>
                    </button>
                  </div>
                </div>
              )}
              
              {/* Action bar for split view - just copy/reset buttons */}
              {isSplitView && (
                <div className="flex items-center justify-end gap-1">
                  {hasUnsavedChanges && (
                    <button 
                      onClick={handleReset} 
                      className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                    >
                      <RotateCcw className="size-3 mr-1" />
                      <span className="hidden sm:inline">Reset</span>
                    </button>
                  )}
                  <button 
                    onClick={handleCopy} 
                    disabled={!hasContent}
                    className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {copied ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                </div>
              )}
            </div>

            {/* AI Options Bar - below working statement */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <div className="flex items-center gap-1.5">
                {/* AI Assist button - always visible */}
                <button
                  onClick={() => {
                    const isCurrentlyOpen = state.mode === "ai-assist" && !showRevisePanel;
                    if (isCurrentlyOpen) {
                      // Toggle off - go back to edit mode
                      handleModeChange("edit");
                    } else {
                      // Toggle on
                      handleModeChange("ai-assist");
                      setShowRevisePanel(false);
                      // Scroll panel into view after it renders
                      setTimeout(() => {
                        aiGeneratePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }, 100);
                    }
                  }}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs inline-flex items-center justify-center transition-colors",
                    state.mode === "ai-assist" && !showRevisePanel
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Sparkles className="size-3 mr-1" />
                  <span className="hidden sm:inline">AI Generate</span>
                  <span className="sm:hidden">AI</span>
                </button>

                {/* Revise button - only visible when text exists */}
                {hasContent && (
                  <button
                    onClick={() => {
                      const opening = !showRevisePanel;
                      setShowRevisePanel(opening);
                      setGeneratedRevisions([]);
                      // Scroll panel into view after it renders
                      if (opening) {
                        setTimeout(() => {
                          revisePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 100);
                      }
                    }}
                    disabled={isRevising}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-xs inline-flex items-center justify-center transition-colors",
                      showRevisePanel
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Wand2 className="size-3 mr-1" />
                    <span className="hidden sm:inline">Revise Statement</span>
                    <span className="sm:hidden">Revise</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Refresh button */}
                {onRefresh && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                          isRefreshing && "animate-spin"
                        )}
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh</TooltipContent>
                  </Tooltip>
                )}

                {/* History button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                        showHistory && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => {
                        setShowHistory(!showHistory);
                        if (!showHistory) setShowExamples(false);
                      }}
                    >
                      <History className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>History</TooltipContent>
                </Tooltip>

                {/* Examples button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                        showExamples && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => {
                        setShowExamples(!showExamples);
                        if (!showExamples) setShowHistory(false);
                      }}
                    >
                      {savedExamples.length > 0 ? (
                        <BookMarked className="size-3.5" />
                      ) : (
                        <Bookmark className="size-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Examples {savedExamples.length > 0 && `(${savedExamples.length})`}
                  </TooltipContent>
                </Tooltip>

                {/* Snapshot button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none",
                        isCreatingSnapshot && "animate-pulse"
                      )}
                      disabled={!hasContent || isCreatingSnapshot}
                      onClick={handleCreateSnapshot}
                    >
                      <Camera className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Save snapshot</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* History Panel - inline dropdown */}
            {showHistory && (
              <div className="rounded-lg border bg-card shadow-lg animate-in fade-in-0 duration-200">
                <div className="p-3 border-b">
                  <h4 className="font-medium text-sm">Snapshot History</h4>
                  <p className="text-xs text-muted-foreground">
                    {snapshots.length} snapshot{snapshots.length !== 1 && "s"}
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {snapshots.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      No snapshots yet. Click the camera icon to save your current text.
                    </p>
                  ) : (
                    snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3 border-b last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs text-muted-foreground">
                            {new Date(snap.created_at).toLocaleString()}
                          </p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleRestoreSnapshot(snap)}
                                className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              >
                                <RotateCcw className="size-3 inline mr-0.5" />
                                Restore
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Replace current statement with this version</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-sm select-text cursor-text whitespace-pre-wrap">
                          {snap.statement_text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Saved Examples Panel */}
            {showExamples && (
              <div className="rounded-lg border bg-card shadow-lg animate-in fade-in-0 duration-200">
                <div className="p-3 border-b">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <BookMarked className="size-4" />
                    Saved Examples
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {savedExamples.length} example{savedExamples.length !== 1 && "s"} saved for reference
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {savedExamples.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      No saved examples yet. Generate statements and save your favorites here for later.
                    </p>
                  ) : (
                    savedExamples.map((example) => (
                      <div
                        key={example.id}
                        className="p-3 border-b last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>
                              {example.created_by_rank ? `${example.created_by_rank} ${example.created_by_name}` : example.created_by_name || "Unknown"}
                            </span>
                            <span>•</span>
                            <span>{new Date(example.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {!isLockedByOther && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleUseStatement(example.statement_text)}
                                    className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  >
                                    <Check className="size-3 inline mr-0.5" />
                                    Use
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Use this as your statement</TooltipContent>
                              </Tooltip>
                            )}
                            {onDeleteExample && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => onDeleteExample(example.id)}
                                    className="text-[10px] px-1.5 py-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Delete example</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        {example.note && (
                          <p className="text-[10px] text-muted-foreground mb-1 italic">"{example.note}"</p>
                        )}
                        <p className="text-sm select-text cursor-text whitespace-pre-wrap">
                          {example.statement_text}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className={cn("text-[10px] tabular-nums", getCharacterCountColor(example.statement_text.length, maxChars))}>
                            {example.statement_text.length}/{maxChars} chars
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Revise Panel - fades in smoothly below */}
            {showRevisePanel && (
              <div 
                ref={revisePanelRef}
                className="rounded-lg border bg-muted/30 p-4 space-y-4 animate-in fade-in-0 duration-300"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Wand2 className="size-4" />
                    Revise Current Statement
                  </h4>
                  <button
                    onClick={handleCancelRevise}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  {/* Top row: Versions and Context */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Version count selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Versions:</span>
                      <div className="flex items-center border rounded-md">
                        {[1, 2, 3].map((num) => (
                          <button
                            key={num}
                            onClick={() => setReviseVersionCount(num)}
                            className={cn(
                              "px-2.5 py-1 text-xs transition-colors",
                              num === 1 && "rounded-l-md",
                              num === 3 && "rounded-r-md",
                              reviseVersionCount === num
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            )}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Context input */}
                    <div className="flex-1">
                      <input
                        type="text"
                        value={reviseContext}
                        onChange={(e) => setReviseContext(e.target.value)}
                        placeholder="Optional: How should it sound? (e.g., more concise, more impactful...)"
                        className="w-full h-7 px-2.5 text-xs rounded-md border border-input bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  {/* Aggressiveness slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Word Replacement:</span>
                      <span className="text-xs font-medium tabular-nums">
                        {reviseAggressiveness <= 20 ? "Minimal" : reviseAggressiveness <= 40 ? "Conservative" : reviseAggressiveness <= 60 ? "Moderate" : reviseAggressiveness <= 80 ? "Aggressive" : "Maximum"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground shrink-0">Keep Most</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="10"
                        value={reviseAggressiveness}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setReviseAggressiveness(value);
                          styleFeedback.trackSliderUsed(value);
                        }}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">Replace All</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {reviseAggressiveness <= 20 
                        ? "Only fix obvious issues, preserve your voice" 
                        : reviseAggressiveness <= 40 
                          ? "Light touch, replace only weak words" 
                          : reviseAggressiveness <= 60 
                            ? "Balanced refresh with new phrasing" 
                            : reviseAggressiveness <= 80 
                              ? "Substantial rewrite, keep only metrics" 
                              : "Complete rewrite, preserve only data"}
                    </p>
                  </div>

                  {/* Fill to max toggle */}
                  <div className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium">Fill to Maximum</span>
                      <p className="text-[10px] text-muted-foreground">Target {maxChars - 10}-{maxChars} chars for maximum impact</p>
                    </div>
                    <button
                      onClick={() => {
                        const newValue = !reviseFillToMax;
                        setReviseFillToMax(newValue);
                        styleFeedback.trackToggleUsed(newValue);
                      }}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        reviseFillToMax ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg transition-transform",
                          reviseFillToMax ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Generate button */}
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateRevisions}
                    disabled={isRevising || !localText.trim()}
                    className="flex-1 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {isRevising ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="size-4 mr-2" />
                    )}
                    Generate {reviseVersionCount} Revision{reviseVersionCount > 1 ? "s" : ""}
                  </button>
                </div>

                {/* Generated Revisions - fade in below */}
                {generatedRevisions.length > 0 && (
                  <div className="space-y-3 pt-3 border-t animate-in fade-in-0 duration-300">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium text-muted-foreground">
                        Generated Revisions ({generatedRevisions.length})
                      </h5>
                      {isLockedByOther && lockedByInfo && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="size-3" />
                          Collaborative editing
                        </span>
                      )}
                    </div>
                    {generatedRevisions.map((revision, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border bg-background space-y-2 animate-in fade-in-0 duration-200"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Version {index + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(revision);
                                    toast.success("Copied to clipboard");
                                    // Track copy for style learning
                                    styleFeedback.trackRevisionCopied({
                                      version: index + 1,
                                      text: revision,
                                      category: mpaCategory,
                                    });
                                  }}
                                  className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center"
                                >
                                  <Copy className="size-3 mr-1" />
                                  Copy
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy this revision</TooltipContent>
                            </Tooltip>
                            {/* Save to Examples button */}
                            {onSaveExample && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleSaveToExamples(revision, `Revision v${index + 1}`)}
                                    disabled={isSavingExample}
                                    className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center disabled:opacity-50"
                                  >
                                    <Bookmark className="size-3 mr-1" />
                                    Save
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Save to examples for later</TooltipContent>
                              </Tooltip>
                            )}
                            {/* Use This button - only when not locked */}
                            {!isLockedByOther && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleUseRevision(revision, index)}
                                    className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center"
                                  >
                                    <Check className="size-3 mr-1" />
                                    Use This
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Replace your statement with this</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <p className="text-sm select-text cursor-text whitespace-pre-wrap leading-relaxed">
                          {revision}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className={cn("text-[10px] tabular-nums", getCharacterCountColor(revision.length, maxChars))}>
                            {revision.length}/{maxChars} chars
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Generate Panel - shows when AI mode is active and not in revise mode */}
            {state.mode === "ai-assist" && !showRevisePanel && (
              <div 
                ref={aiGeneratePanelRef}
                className="rounded-lg border bg-muted/30 p-4 space-y-4 animate-in fade-in-0 duration-300"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Sparkles className="size-4" />
                    Generate New Statement from:
                  </h4>
                </div>

                {/* Source Toggle - HLR gets 3 options including "Use EPB Statements" */}
                {isHLR ? (
                  <HLRSourceToggle
                    sourceType={state.sourceType}
                    onSourceChange={(source) => updateSectionState(section.mpa, { sourceType: source })}
                    actionsCount={mpaAccomplishments.length}
                    epbStatementsCount={epbStatementsCount}
                  />
                ) : (
                  <SourceToggle
                    sourceType={state.sourceType}
                    onSourceChange={(source) => updateSectionState(section.mpa, { sourceType: source })}
                    actionsCount={mpaAccomplishments.length}
                  />
                )}

                {/* Two-statement toggle */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-background/50 border">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium">Two Statements</span>
                    <p className="text-[10px] text-muted-foreground">
                      Generate two sentences sharing the {maxChars} character limit
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state.usesTwoStatements}
                    onClick={() => updateSectionState(section.mpa, { usesTwoStatements: !state.usesTwoStatements })}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      state.usesTwoStatements ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                        state.usesTwoStatements ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Performance Actions source */}
                {state.sourceType === "actions" && (
                  <div className="space-y-3">
                    {/* Statement 1 actions */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          {state.usesTwoStatements ? "Statement 1 Actions" : "Load Actions"}
                        </span>
                        <ActionSelectorSheet
                          accomplishments={mpaAccomplishments}
                          selectedIds={state.statement1ActionIds}
                          onSelectionChange={handleStatement1ActionsChange}
                          targetMpa={section.mpa}
                          statementNumber={state.usesTwoStatements ? 1 : undefined}
                          cycleYear={cycleYear}
                          trigger={
                            <button className="inline-flex items-center justify-center rounded-md h-7 px-3 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                              <Plus className="size-3 mr-1" />
                              {statement1Actions.length > 0 ? `${statement1Actions.length} Loaded` : "Load Actions"}
                            </button>
                          }
                        />
                      </div>
                      {statement1Actions.length > 0 && (
                        <div className="space-y-2">
                          {statement1Actions.map((action) => (
                            <LoadedActionCard
                              key={action.id}
                              action={action}
                              statementNumber={state.usesTwoStatements ? 1 : undefined}
                              onRemove={() => removeStatement1Action(action.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Statement 2 actions (only in two-statement mode) */}
                    {state.usesTwoStatements && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Statement 2 Actions</span>
                          <ActionSelectorSheet
                            accomplishments={mpaAccomplishments}
                            selectedIds={state.statement2ActionIds}
                            onSelectionChange={handleStatement2ActionsChange}
                            targetMpa={section.mpa}
                            statementNumber={2}
                            cycleYear={cycleYear}
                            trigger={
                              <button className="inline-flex items-center justify-center rounded-md h-7 px-3 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                                <Plus className="size-3 mr-1" />
                                {statement2Actions.length > 0 ? `${statement2Actions.length} Loaded` : "Load Actions"}
                              </button>
                            }
                          />
                        </div>
                        {statement2Actions.length > 0 && (
                          <div className="space-y-2">
                            {statement2Actions.map((action) => (
                              <LoadedActionCard
                                key={action.id}
                                action={action}
                                statementNumber={2}
                                onRemove={() => removeStatement2Action(action.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Custom context source */}
                {state.sourceType === "custom" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <span className="text-xs font-medium">
                        {state.usesTwoStatements ? "Statement 1 Context" : "Custom Context"}
                      </span>
                      <textarea
                        value={state.statement1Context}
                        onChange={(e) => updateSectionState(section.mpa, { statement1Context: e.target.value })}
                        placeholder="Paste accomplishment details, metrics, impact, or any context for the AI to use..."
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                      />
                    </div>
                    {state.usesTwoStatements && (
                      <div className="space-y-2 pt-2 border-t">
                        <span className="text-xs font-medium">Statement 2 Context</span>
                        <textarea
                          value={state.statement2Context}
                          onChange={(e) => updateSectionState(section.mpa, { statement2Context: e.target.value })}
                          placeholder="Context for the second statement..."
                          rows={3}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* EPB Summary source (HLR only) - uses all MPA statements for holistic assessment */}
                {state.sourceType === "epb-summary" && isHLR && (
                  <div className="space-y-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
                    <div className="flex items-start gap-2">
                      <Crown className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Generate HLR from EPB Statements
                        </span>
                        <p className="text-xs text-muted-foreground">
                          The AI will analyze all {epbStatementsCount} MPA statements in your EPB to generate a holistic 
                          Commander&apos;s perspective assessment, synthesizing key accomplishments and impacts.
                        </p>
                      </div>
                    </div>
                    {epbStatementsCount === 0 && (
                      <div className="p-2 rounded bg-amber-100/50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
                        No MPA statements found. Add content to your MPA sections first.
                      </div>
                    )}
                  </div>
                )}

                {/* Version count and Generate button */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Version count selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Versions:</span>
                    <div className="flex items-center border rounded-md">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          onClick={() => setGenerateVersionCount(num)}
                          className={cn(
                            "px-2.5 py-1 text-xs transition-colors",
                            num === 1 && "rounded-l-md",
                            num === 3 && "rounded-r-md",
                            generateVersionCount === num
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={handleGenerate}
                    disabled={state.isGenerating || !canGenerate}
                    className="flex-1 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {state.isGenerating ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="size-4 mr-2" />
                    )}
                    Generate {generateVersionCount} Statement{generateVersionCount > 1 ? "s" : ""}
                  </button>
                </div>

                {/* Generated Statements - fade in below */}
                {generatedStatements.length > 0 && (
                  <div className="space-y-3 pt-3 border-t animate-in fade-in-0 duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-medium text-muted-foreground">
                          Generated Statements ({generatedStatements.length})
                        </h5>
                        {rateeId && (
                          <ClarifyingQuestionsIndicator
                            mpaKey={section.mpa}
                            rateeId={rateeId}
                            hasGenerated={generatedStatements.length > 0}
                          />
                        )}
                      </div>
                      {isLockedByOther && lockedByInfo && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="size-3" />
                          Collaborative editing
                        </span>
                      )}
                    </div>
                    {generatedStatements.map((statement, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border bg-background space-y-2 animate-in fade-in-0 duration-200"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Version {index + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(statement);
                                    toast.success("Copied to clipboard");
                                  }}
                                  className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center"
                                >
                                  <Copy className="size-3 mr-1" />
                                  Copy
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy this statement</TooltipContent>
                            </Tooltip>
                            {/* Save to Examples button - always show when available */}
                            {onSaveExample && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleSaveToExamples(statement, `Generated v${index + 1}`)}
                                    disabled={isSavingExample}
                                    className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center disabled:opacity-50"
                                  >
                                    <Bookmark className="size-3 mr-1" />
                                    Save
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Save to examples for later</TooltipContent>
                              </Tooltip>
                            )}
                            {/* Use This button - only when not locked */}
                            {!isLockedByOther && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleUseStatement(statement)}
                                    className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center"
                                  >
                                    <Check className="size-3 mr-1" />
                                    Use This
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Use this as your statement</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <p className="text-sm select-text cursor-text whitespace-pre-wrap leading-relaxed">
                          {statement}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className={cn("text-[10px] tabular-nums", getCharacterCountColor(statement.length, maxChars))}>
                            {statement.length}/{maxChars} chars
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
      )}

      {/* Clarifying Questions Modal - only render for THIS MPA if it has the active question set */}
      {rateeId && activeQuestionSet?.mpaKey === section.mpa && (
        <ClarifyingQuestionsModal
          onRegenerate={async (clarifyingContext, _mpaKey) => {
            console.log("[MPASectionCard] onRegenerate called for MPA:", section.mpa, "with clarifyingContext length:", clarifyingContext.length);
            // Regenerate with clarifying context passed as a separate parameter
            updateSectionState(section.mpa, { isGenerating: true });
            setGeneratedStatements([]);
            try {
              console.log("[MPASectionCard] Calling onGenerateStatement with clarifyingContext...");
              const results = await onGenerateStatement({
                useAccomplishments: state.sourceType === "actions",
                accomplishmentIds: state.usesTwoStatements
                  ? [...state.statement1ActionIds, ...state.statement2ActionIds]
                  : state.statement1ActionIds,
                customContext: state.sourceType === "custom" ? state.statement1Context : undefined,
                usesTwoStatements: state.usesTwoStatements,
                statement1Context: state.statement1Context,
                statement2Context: state.statement2Context,
                versionCount: 3,
                // Pass clarifying context as separate parameter - API will inject it properly
                clarifyingContext,
              });
              console.log("[MPASectionCard] onGenerateStatement returned results:", results?.length);
              setGeneratedStatements(results);
            } catch (err) {
              console.error("[MPASectionCard] Regenerate with context error:", err);
            } finally {
              updateSectionState(section.mpa, { isGenerating: false });
            }
          }}
          isRegenerating={state.isGenerating}
        />
      )}
    </Card>
  );
}
