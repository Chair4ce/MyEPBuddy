"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// IMPORTANT: Not using shadcn Button, Switch, Progress, Label to avoid Radix ref composition issues
// Using native HTML elements instead
import { Badge } from "@/components/ui/badge";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
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
import { Analytics } from "@/lib/analytics";
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
  ChevronLeft,
  ChevronRight,
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
  Trophy,
  Settings2,
} from "lucide-react";
import { useEPBShellStore, type MPAWorkspaceMode, type SourceType } from "@/stores/epb-shell-store";
import { LoadedActionCard } from "./loaded-action-card";
import { ActionSelectorSheet } from "./action-selector-sheet";
import { SentencePills, type DraggedSentence } from "./sentence-pills";
import { SentenceDropOverlay } from "./sentence-drop-overlay";
import { SplitViewEditor } from "./split-view-editor";
// Per-section collaboration removed - using page-level collaboration instead
import type { EPBShellSection, EPBShellSnapshot, EPBSavedExample, Accomplishment, AwardSelection, Rank } from "@/types/database";
import { useStyleFeedback, getMpaCategory } from "@/hooks/use-style-feedback";
import { ClarifyingQuestionsIndicator, ClarifyingQuestionsModal } from "@/components/generate/clarifying-questions-modal";
import { useClarifyingQuestionsStore } from "@/stores/clarifying-questions-store";
import { PromptSettingsModal } from "./prompt-settings-modal";
import { MpaDescriptionToggleButton, scrollMpaDescriptionPanelTo } from "./mpa-description-editor";
import { getEpbZenModeClassName } from "./epb-zen-mode";
import {
  EpbAnimatedCollapse,
  EPB_GENERATED_RESULTS_CLOSE_MS,
  EPB_PANEL_CLOSE_MS,
} from "./epb-animated-collapse";
import {
  animateEpbShellResize,
  animateEpbShellResizeAfter,
  EPB_SPLIT_INNER_CLOSE_MS,
} from "./epb-resize-transition";
interface MPASectionCardProps {
  section: EPBShellSection;
  /** Ratee ID for clarifying questions feature */
  rateeId?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onCreateSnapshot: (text: string) => Promise<void>;
  onGenerateStatement: (options: GenerateOptions) => Promise<string[]>;
  onReviseStatement: (text: string, context?: string, versionCount?: number, aggressiveness?: number) => Promise<string[]>;
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
  // Awards/coins available for this ratee (used in HLR and any MPA)
  rateeAwards?: AwardSelection[];
  // Ratee rank for prompt settings modal
  rateeRank?: Rank | null;
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
  // Awards/coins to integrate into the statement
  selectedAwards?: AwardSelection[];
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
        <Zap className="size-4 sm:size-5" />
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
        <FileText className="size-4 sm:size-5" />
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
          <Zap className="size-4 sm:size-5" />
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
          <FileText className="size-4 sm:size-5" />
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
        <Crown className="size-4 sm:size-5" />
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
  selectedAwardIds: [] as string[],
  selectedAccomplishmentIds: [] as string[],
};

/** A single generated batch of revisions kept in short-term session history. */
interface RevisionBatch {
  revisions: string[];
  context: string;
  aggressiveness: number;
  createdAt: number;
}

/** Cap on remembered revision sets per section (short-term, in-session). */
const MAX_REVISION_HISTORY = 8;

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
  rateeAwards = [],
  // Ratee rank
  rateeRank,
}: MPASectionCardProps) {
  const { mpa, isHLR, maxChars } = getMPAInfo(section.mpa);
  
  // Subscribe to the specific section state from the store
  const sectionStates = useEPBShellStore((s) => s.sectionStates);
  const storedState = sectionStates[section.mpa];
  const updateSectionState = useEPBShellStore((s) => s.updateSectionState);
  const initializeSectionState = useEPBShellStore((s) => s.initializeSectionState);
  const setFocusedMpaKey = useEPBShellStore((s) => s.setFocusedMpaKey);
  const mpaDescriptionDrawerOpen = useEPBShellStore((s) => s.mpaDescriptionDrawerOpen);
  const zenModeMpaKey = useEPBShellStore((s) => s.zenModeMpaKey);
  const setZenModeMpaKey = useEPBShellStore((s) => s.setZenModeMpaKey);
  
  // Get active clarifying question set for modal rendering
  const activeQuestionSet = useClarifyingQuestionsStore((s) => s.getActiveQuestionSet());
  
  // Use local ref for autosave timer to avoid Zustand updates on every keystroke
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use stored state or defaults
  const state = storedState || DEFAULT_SECTION_STATE;
  
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSplitViewClosing, setIsSplitViewClosing] = useState(false);
  const [isRevisePanelClosing, setIsRevisePanelClosing] = useState(false);
  const [isRevisionsResultsClosing, setIsRevisionsResultsClosing] = useState(false);
  const [isStatementsResultsClosing, setIsStatementsResultsClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mpaCardBodyShellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>(section.statement_text);
  
  // Revise panel state
  const [showRevisePanel, setShowRevisePanel] = useState(false);
  const [reviseVersionCount, setReviseVersionCount] = useState(3);
  const [reviseContext, setReviseContext] = useState("");
  const [reviseAggressiveness, setReviseAggressiveness] = useState(50);
  const [generatedRevisions, setGeneratedRevisions] = useState<string[]>([]);
  const [isRevising, setIsRevising] = useState(false);
  // Short-term, in-session history of generated revision sets so users can
  // revisit previous results for free instead of spending another token.
  const [revisionHistory, setRevisionHistory] = useState<RevisionBatch[]>([]);
  const [activeRevisionIndex, setActiveRevisionIndex] = useState(0);
  
  // AI Generate panel state
  const [generateVersionCount, setGenerateVersionCount] = useState(3);
  const [generatedStatements, setGeneratedStatements] = useState<string[]>([]);
  
  // Saved examples panel state
  const [showExamples, setShowExamples] = useState(false);
  
  // Style learning feedback (non-blocking, fire-and-forget)
  const styleFeedback = useStyleFeedback();
  const mpaCategory = getMpaCategory(section.mpa);
  // Tracks which individual statement is currently being saved so only that
  // one button shows a loading state (never disables the whole batch).
  const [savingExampleText, setSavingExampleText] = useState<string | null>(null);
  
  // Refs for scrolling panels into view
  const aiGeneratePanelRef = useRef<HTMLDivElement>(null);
  const revisePanelRef = useRef<HTMLDivElement>(null);
  const statementAreaRef = useRef<HTMLDivElement>(null);
  const generatedRevisionsResultsRef = useRef<HTMLDivElement>(null);
  const generatedStatementsResultsRef = useRef<HTMLDivElement>(null);
  const generatedRevisionsRef = useRef<string[]>([]);
  const generatedStatementsRef = useRef<string[]>([]);
  const zenExitGuardRef = useRef({
    showRevisePanel: false,
    isRevisePanelClosing: false,
    isRevisionsResultsClosing: false,
    isStatementsResultsClosing: false,
    mode: "edit" as MPAWorkspaceMode,
  });

  const getStatementScrollTarget = useCallback(() => {
    return textareaRef.current ?? statementAreaRef.current ?? cardRef.current;
  }, []);

  const scrollStatementIntoView = useCallback(() => {
    const target = getStatementScrollTarget();
    if (!target) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    });
  }, [getStatementScrollTarget]);

  const scrollResultsIntoView = useCallback(
    (
      resultsEl: HTMLDivElement | null,
      itemSelector: string
    ) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!resultsEl) return;

          resultsEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });

          window.setTimeout(() => {
            const lastItem = resultsEl.querySelector<HTMLElement>(`${itemSelector}:last-child`);
            if (!lastItem) return;

            const lastRect = lastItem.getBoundingClientRect();
            const inView = lastRect.top >= 24 && lastRect.bottom <= window.innerHeight - 24;
            if (!inView) {
              lastItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
          }, 350);
        });
      });
    },
    []
  );

  const scrollGeneratedRevisionsIntoView = useCallback(() => {
    scrollResultsIntoView(generatedRevisionsResultsRef.current, "[data-epb-revision-item]");
  }, [scrollResultsIntoView]);

  const scrollGeneratedStatementsIntoView = useCallback(() => {
    scrollResultsIntoView(generatedStatementsResultsRef.current, "[data-epb-statement-item]");
  }, [scrollResultsIntoView]);

  const resizeCardBody = useCallback((update: () => void, onComplete?: () => void) => {
    animateEpbShellResize(mpaCardBodyShellRef.current, update, onComplete);
  }, []);

  const resizeCardBodyAfter = useCallback(
    async (update: () => void | Promise<void>, onComplete?: () => void) => {
      await animateEpbShellResizeAfter(mpaCardBodyShellRef.current, update, onComplete);
    },
    []
  );

  generatedRevisionsRef.current = generatedRevisions;
  generatedStatementsRef.current = generatedStatements;

  zenExitGuardRef.current = {
    showRevisePanel,
    isRevisePanelClosing,
    isRevisionsResultsClosing,
    isStatementsResultsClosing,
    mode: state.mode,
  };

  const isUseThisClosing =
    isRevisePanelClosing || isRevisionsResultsClosing || isStatementsResultsClosing;

  const syncFocusedMpaDescription = useCallback(() => {
    if (mpaDescriptionDrawerOpen) {
      setFocusedMpaKey(section.mpa);
      scrollMpaDescriptionPanelTo(section.mpa);
    }
  }, [mpaDescriptionDrawerOpen, section.mpa, setFocusedMpaKey]);

  const enterZenMode = useCallback(() => {
    setZenModeMpaKey(section.mpa);
    syncFocusedMpaDescription();
  }, [section.mpa, setZenModeMpaKey, syncFocusedMpaDescription]);

  const tryExitZenMode = useCallback(() => {
    requestAnimationFrame(() => {
      if (cardRef.current?.contains(document.activeElement)) return;
      const {
        showRevisePanel: reviseOpen,
        isRevisePanelClosing: reviseClosing,
        isRevisionsResultsClosing: revisionsClosing,
        isStatementsResultsClosing: statementsClosing,
        mode,
      } = zenExitGuardRef.current;
      if (reviseOpen || reviseClosing || revisionsClosing || statementsClosing || mode === "ai-assist") {
        return;
      }
      if (useEPBShellStore.getState().zenModeMpaKey === section.mpa) {
        setZenModeMpaKey(null);
      }
    });
  }, [section.mpa, setZenModeMpaKey]);

  const closeRevisePanelWithScroll = useCallback(() => {
    const hasRevisions = generatedRevisionsRef.current.length > 0;

    const closePanel = () => {
      setIsRevisePanelClosing(true);
      setTimeout(() => {
        animateEpbShellResize(mpaCardBodyShellRef.current, () => {
          setShowRevisePanel(false);
          setGeneratedRevisions([]);
          setReviseContext("");
          setIsRevisePanelClosing(false);
          setIsRevisionsResultsClosing(false);
        }, tryExitZenMode);
      }, EPB_PANEL_CLOSE_MS);
    };

    if (hasRevisions) {
      scrollStatementIntoView();
      setIsRevisionsResultsClosing(true);
      setTimeout(closePanel, EPB_GENERATED_RESULTS_CLOSE_MS);
      return;
    }

    scrollStatementIntoView();
    closePanel();
  }, [scrollStatementIntoView, tryExitZenMode]);

  const closeGeneratedStatementsWithScroll = useCallback(() => {
    if (generatedStatementsRef.current.length === 0) {
      scrollStatementIntoView();
      return;
    }

    scrollStatementIntoView();
    setIsStatementsResultsClosing(true);
    setTimeout(() => {
      animateEpbShellResize(mpaCardBodyShellRef.current, () => {
        setGeneratedStatements([]);
        setIsStatementsResultsClosing(false);
      });
    }, EPB_GENERATED_RESULTS_CLOSE_MS);
  }, [scrollStatementIntoView]);
  
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
    Analytics.statementCopied(section.mpa);
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
      Analytics.statementSnapshotCreated(section.mpa);
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
    Analytics.statementSnapshotRestored(section.mpa);
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

    enterZenMode();
    
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
    tryExitZenMode();
    
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

    if (newMode === "ai-assist") {
      enterZenMode();
    } else if (newMode !== "edit") {
      tryExitZenMode();
    }
  };


  // Reset to saved version
  const handleReset = () => {
    Analytics.statementReset(section.mpa);
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
      
      // Build selected awards to integrate into statement
      const selectedAwardsForGen = state.selectedAwardIds?.length > 0
        ? rateeAwards.filter((a) => state.selectedAwardIds.includes(a.id))
        : undefined;

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
        selectedAwards: selectedAwardsForGen,
      });
      if (results.length > 0) {
        resizeCardBody(() => setGeneratedStatements(results), scrollGeneratedStatementsIntoView);
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
    Analytics.statementGenerated(section.mpa, state.sourceType || "actions");
    setLocalText(statement);
    updateSectionState(section.mpa, {
      draftText: statement,
      isDirty: true,
    });
    toast.success("Statement applied");
    closeGeneratedStatementsWithScroll();
  };
  
  // Save a statement to the examples scratchpad
  // Whether a given statement is already saved to this section's examples.
  // Derived from the DB-backed list so the saved state survives regeneration,
  // history navigation, and reloads.
  const isExampleSaved = (text: string) =>
    savedExamples.some((e) => e.statement_text.trim() === text.trim());

  const handleSaveToExamples = async (statement: string, note?: string) => {
    if (!onSaveExample || isExampleSaved(statement)) return;
    setSavingExampleText(statement);
    try {
      await onSaveExample(statement, note);
      toast.success("Statement saved to your examples");
    } catch {
      toast.error("Failed to save statement");
    } finally {
      setSavingExampleText(null);
    }
  };

  // Generate revisions with AI (for revise panel)
  const handleGenerateRevisions = async () => {
    if (!localText.trim()) {
      toast.error("No text to revise");
      return;
    }
    Analytics.statementRevisionStarted(section.mpa);
    setIsRevising(true);
    setGeneratedRevisions([]);
    try {
      const revisions = await onReviseStatement(localText, reviseContext || undefined, reviseVersionCount, reviseAggressiveness);
      if (revisions.length > 0) {
        // Record this set in short-term history so the user can return to it
        // for free instead of spending another token to regenerate.
        const batch: RevisionBatch = {
          revisions,
          context: reviseContext.trim(),
          aggressiveness: reviseAggressiveness,
          createdAt: Date.now(),
        };
        setRevisionHistory((prev) => {
          const next = [...prev, batch].slice(-MAX_REVISION_HISTORY);
          setActiveRevisionIndex(next.length - 1);
          return next;
        });
        resizeCardBody(() => setGeneratedRevisions(revisions), scrollGeneratedRevisionsIntoView);
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
    const dismissRevisePanel = () => {
      resizeCardBody(() => {
        setShowRevisePanel(false);
        setGeneratedRevisions([]);
        setReviseContext("");
        setIsRevisionsResultsClosing(false);
        tryExitZenMode();
      });
    };

    if (generatedRevisionsRef.current.length > 0) {
      scrollStatementIntoView();
      setIsRevisionsResultsClosing(true);
      setTimeout(dismissRevisePanel, EPB_GENERATED_RESULTS_CLOSE_MS);
      return;
    }

    scrollStatementIntoView();
    dismissRevisePanel();
  };
  
  // Switch the displayed revisions to a previously generated set (no token cost).
  const viewRevisionBatch = (index: number) => {
    const batch = revisionHistory[index];
    if (!batch) return;
    setActiveRevisionIndex(index);
    setReviseContext(batch.context);
    setReviseAggressiveness(batch.aggressiveness);
    resizeCardBody(() => setGeneratedRevisions(batch.revisions));
  };

  // Use a generated revision (replace current statement)
  const handleUseRevision = (revision: string, versionIndex: number) => {
    Analytics.statementRevisionApplied(section.mpa);
    setLocalText(revision);
    updateSectionState(section.mpa, {
      draftText: revision,
      isDirty: true,
    });
    toast.success("Revision applied");
    
    // Track for style learning (fire-and-forget)
    styleFeedback.trackRevisionSelected({
      version: versionIndex + 1,
      totalVersions: generatedRevisions.length,
      charCount: revision.length,
      category: mpaCategory,
      aggressiveness: reviseAggressiveness,
    });

    closeRevisePanelWithScroll();
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

  const handleToggleCollapse = () => {
    if (!isCollapsed) {
      textareaRef.current?.blur();
      if (useEPBShellStore.getState().zenModeMpaKey === section.mpa) {
        setZenModeMpaKey(null);
      }
    }
    onToggleCollapse();
  };

  // Check if we can generate
  const canGenerate = state.sourceType === "actions"
    ? (state.statement1ActionIds.length > 0 || (state.usesTwoStatements && state.statement2ActionIds.length > 0))
    : state.sourceType === "epb-summary"
      ? epbStatementsCount > 0
      : state.statement1Context.trim().length > 0;

  return (
    <Card
      ref={cardRef}
      data-epb-zen-focus={section.mpa}
      onFocusCapture={!isCollapsed ? enterZenMode : undefined}
      onBlurCapture={!isCollapsed ? tryExitZenMode : undefined}
      className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden scroll-mt-20 gap-3 sm:gap-4 py-3 sm:py-5",
        "border-primary-300/30 dark:border-primary-700/30 bg-background dark:bg-muted/30",
        isHLR && "border-primary-300/30 dark:border-primary-700/30",
        hasUnsavedChanges && "ring-1 ring-amber-400/50",
        section.is_complete && "border-green-500/30 bg-green-50/30 dark:bg-green-900/10",
        isHighlighted && "animate-pulse-highlight",
        getEpbZenModeClassName(zenModeMpaKey, section.mpa)
      )}
    >
      {/* Header - NO Collapsible/Radix components to avoid ref issues */}
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <button 
            className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 text-left group"
            onClick={handleToggleCollapse}
          >
            {isHLR && <Crown className="size-5 sm:size-6 text-amber-600 shrink-0" />}
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
                <Users className="size-4 sm:size-5" />
                <span className="hidden md:inline">{lockedByInfo.rank || ""} {lockedByInfo.name.split(" ")[0]} editing</span>
                <span className="md:hidden">Collab</span>
              </Badge>
            )}
            {/* Mobile lock indicator */}
            {isLockedByOther && (
              <Lock className="size-4 text-amber-600 shrink-0 sm:hidden" />
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
              <ChevronDown className="size-4 sm:size-5 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            ) : (
              <ChevronUp className="size-4 sm:size-5 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            )}
          </button>
          {/* MPA description info button */}
          <MpaDescriptionToggleButton mpaKey={section.mpa} />
          {/* Split view toggle button - only for non-HLR sections */}
          {!isHLR && onToggleSplitView && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-md size-7 shrink-0 transition-colors",
                    isSplitView
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSplitViewClosing) return;

                    if (isSplitView) {
                      setIsSplitViewClosing(true);
                      window.setTimeout(() => {
                        animateEpbShellResize(
                          mpaCardBodyShellRef.current,
                          onToggleSplitView,
                          () => setIsSplitViewClosing(false)
                        );
                      }, EPB_SPLIT_INNER_CLOSE_MS);
                    } else {
                      animateEpbShellResize(
                        mpaCardBodyShellRef.current,
                        onToggleSplitView
                      );
                    }
                  }}
                  disabled={isSplitViewClosing}
                >
                  <Rows2 className="size-5" />
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
                    "inline-flex items-center justify-center rounded-md size-7 shrink-0 transition-colors",
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
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <Circle className="size-5" />
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
                  className="inline-flex items-center justify-center rounded-md size-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
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
        <CardContent
          className="pt-0 pb-4 sm:pb-5 animate-in slide-in-from-top-2 duration-200 px-4 sm:px-6"
        >
          <div ref={mpaCardBodyShellRef} className="space-y-4 sm:space-y-5">
            {/* Working Statement Area - ALWAYS at top */}
            <div ref={statementAreaRef} className="space-y-3">
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

              {/* Textarea or Split View Editor — card body resizes smoothly on toggle */}
              <div>
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
                    onFocus={enterZenMode}
                    onBlur={tryExitZenMode}
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
              </div>
              
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
                        <RotateCcw className="size-4 mr-1.5" />
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                    )}
                    <button 
                      onClick={handleCopy} 
                      disabled={!hasContent}
                      className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
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
                      <RotateCcw className="size-4 mr-1.5" />
                      <span className="hidden sm:inline">Reset</span>
                    </button>
                  )}
                  <button 
                    onClick={handleCopy} 
                    disabled={!hasContent}
                    className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                </div>
              )}
            </div>

            {/* AI Options Bar - below working statement */}
            <div className="flex items-center justify-between gap-2 pt-3 sm:pt-4 border-t">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* AI Assist button - always visible */}
                <button
                  onClick={() => {
                    const isCurrentlyOpen = state.mode === "ai-assist" && !showRevisePanel;
                    if (isCurrentlyOpen) {
                      void resizeCardBodyAfter(() => handleModeChange("edit"));
                    } else {
                      void resizeCardBodyAfter(async () => {
                        await handleModeChange("ai-assist");
                        setShowRevisePanel(false);
                      }, () => {
                        setTimeout(() => {
                          aiGeneratePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 100);
                      });
                    }
                  }}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs inline-flex items-center justify-center transition-colors",
                    state.mode === "ai-assist" && !showRevisePanel
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Sparkles className="size-4 mr-1.5" />
                  <span className="hidden sm:inline">AI Generate</span>
                  <span className="sm:hidden">AI</span>
                </button>

                {/* Revise button - only visible when text exists */}
                {hasContent && (
                  <button
                    onClick={() => {
                      const opening = !showRevisePanel;
                      if (opening) {
                        resizeCardBody(() => {
                          setShowRevisePanel(true);
                          // Restore the last viewed set so prior results return
                          // for free instead of forcing a token-costing regenerate.
                          setGeneratedRevisions(
                            revisionHistory.length > 0
                              ? (
                                  revisionHistory[activeRevisionIndex] ??
                                  revisionHistory[revisionHistory.length - 1]
                                ).revisions
                              : [],
                          );
                        }, () => {
                          setTimeout(() => {
                            revisePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                          }, 100);
                        });
                      } else {
                        handleCancelRevise();
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
                    <Wand2 className="size-4 mr-1.5" />
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
                          "inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                          isRefreshing && "animate-spin"
                        )}
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                      >
                        <RefreshCw className="size-4" />
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
                        "inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                        showHistory && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => {
                        resizeCardBody(() => {
                          setShowHistory(!showHistory);
                          if (!showHistory) setShowExamples(false);
                        });
                      }}
                    >
                      <History className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>History</TooltipContent>
                </Tooltip>

                {/* Examples button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                        showExamples && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => {
                        resizeCardBody(() => {
                          setShowExamples(!showExamples);
                          if (!showExamples) setShowHistory(false);
                        });
                      }}
                    >
                      {savedExamples.length > 0 ? (
                        <BookMarked className="size-5" />
                      ) : (
                        <Bookmark className="size-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Examples {savedExamples.length > 0 && `(${savedExamples.length})`}
                  </TooltipContent>
                </Tooltip>

                {/* Prompt Settings button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                        showPromptSettings && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => setShowPromptSettings(true)}
                      aria-label="Prompt settings"
                    >
                      <Settings2 className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Prompt Settings</TooltipContent>
                </Tooltip>

                {/* Snapshot button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none",
                        isCreatingSnapshot && "animate-pulse"
                      )}
                      disabled={!hasContent || isCreatingSnapshot}
                      onClick={handleCreateSnapshot}
                    >
                      <Camera className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Save snapshot</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* History Panel - inline dropdown */}
            {showHistory && (
              <div className="rounded-lg border bg-card shadow-lg animate-in fade-in-0 duration-200">
                <div className="p-4 border-b">
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
                        className="p-4 border-b last:border-0"
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
                                <RotateCcw className="size-3.5 inline mr-1" />
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
                <div className="p-4 border-b">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <BookMarked className="size-5" />
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
                        className="p-4 border-b last:border-0"
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
                                    <Check className="size-3.5 inline mr-1" />
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
                                    <Trash2 className="size-3.5" />
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

            {/* Revise Panel - collapses smoothly after "Use This" */}
            <EpbAnimatedCollapse
              visible={showRevisePanel || isRevisePanelClosing}
              closing={isRevisePanelClosing}
              durationMs={EPB_PANEL_CLOSE_MS}
            >
              <div
                ref={revisePanelRef}
                className={cn(
                  "rounded-lg border bg-muted/30 p-4 sm:p-5 space-y-4 sm:space-y-5 animate-in fade-in-0 duration-300",
                  isUseThisClosing && "pointer-events-none"
                )}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Wand2 className="size-5" />
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

                </div>

                {/* Generate button */}
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateRevisions}
                    disabled={isRevising || !localText.trim()}
                    className="flex-1 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {isRevising ? (
                      <Loader2 className="size-5 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="size-5 mr-2" />
                    )}
                    Generate {reviseVersionCount} Revision{reviseVersionCount > 1 ? "s" : ""}
                    <TokenCostBadge compact className="ml-2 border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground" />
                  </button>
                </div>

                {/* Generated Revisions - collapse smoothly after "Use This" */}
                <EpbAnimatedCollapse
                  visible={generatedRevisions.length > 0 || isRevisionsResultsClosing}
                  closing={isRevisionsResultsClosing}
                  durationMs={EPB_GENERATED_RESULTS_CLOSE_MS}
                >
                  <div
                    ref={generatedRevisionsResultsRef}
                    className="space-y-4 pt-4 border-t animate-in fade-in-0 duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium text-muted-foreground">
                        Generated Revisions ({generatedRevisions.length})
                      </h5>
                      {isLockedByOther && lockedByInfo && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="size-4" />
                          Collaborative editing
                        </span>
                      )}
                    </div>

                    {/* Short-term history navigator — revisit earlier sets for
                        free instead of regenerating (which spends a token). */}
                    {revisionHistory.length > 1 && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed bg-background/60 px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <History className="size-3.5 shrink-0" aria-hidden="true" />
                          Set {activeRevisionIndex + 1} of {revisionHistory.length}
                          <span className="hidden sm:inline text-muted-foreground/70">
                            · revisit past sets free
                          </span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => viewRevisionBatch(activeRevisionIndex - 1)}
                            disabled={activeRevisionIndex === 0}
                            aria-label="View previous revision set"
                            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <ChevronLeft className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => viewRevisionBatch(activeRevisionIndex + 1)}
                            disabled={activeRevisionIndex >= revisionHistory.length - 1}
                            aria-label="View next revision set"
                            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                      </div>
                    )}
                    {generatedRevisions.map((revision, index) => (
                      <div
                        key={index}
                        data-epb-revision-item
                        className="p-4 rounded-lg border bg-background space-y-2.5 animate-in fade-in-0 duration-200"
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
                                  <Copy className="size-4 mr-1.5" />
                                  Copy
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy this revision</TooltipContent>
                            </Tooltip>
                            {/* Save this individual revision to examples */}
                            {onSaveExample && (() => {
                              const saved = isExampleSaved(revision);
                              const saving = savingExampleText === revision;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleSaveToExamples(revision, `Revision v${index + 1}`)}
                                      disabled={saved || saving}
                                      aria-label={saved ? "Saved to your examples" : "Save this revision to your examples"}
                                      className={cn(
                                        "h-6 px-2 rounded text-[10px] transition-colors inline-flex items-center",
                                        saved ? "text-primary cursor-default" : "hover:bg-muted disabled:opacity-50",
                                      )}
                                    >
                                      {saving ? (
                                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                                      ) : saved ? (
                                        <BookMarked className="size-4 mr-1.5" />
                                      ) : (
                                        <Bookmark className="size-4 mr-1.5" />
                                      )}
                                      {saved ? "Saved" : "Save"}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {saved ? "Saved to your examples" : "Save this revision to your examples"}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                            {/* Use This button - only when not locked */}
                            {!isLockedByOther && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleUseRevision(revision, index)}
                                    disabled={isUseThisClosing}
                                    className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center disabled:opacity-50"
                                  >
                                    <Check className="size-4 mr-1.5" />
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
                </EpbAnimatedCollapse>
              </div>
            </EpbAnimatedCollapse>

            {/* AI Generate Panel - shows when AI mode is active and not in revise mode */}
            {state.mode === "ai-assist" && !showRevisePanel && (
              <div 
                ref={aiGeneratePanelRef}
                className="rounded-lg border bg-muted/30 p-4 sm:p-5 space-y-4 sm:space-y-5 animate-in fade-in-0 duration-300"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Sparkles className="size-5" />
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

                {/* Awards selector - include awards/coins in statement */}
                {rateeAwards.length > 0 && (
                  <div className="space-y-2 p-2 rounded-lg bg-background/50 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Trophy className="size-4 text-amber-500" />
                        <span className="text-xs font-medium">Include Awards/Coins</span>
                      </div>
                      {(state.selectedAwardIds?.length || 0) > 0 && (
                        <button
                          onClick={() => updateSectionState(section.mpa, { selectedAwardIds: [] })}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Select awards or coins to weave into the HLR statement
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {rateeAwards.map((award) => {
                        const isSelected = state.selectedAwardIds?.includes(award.id);
                        return (
                          <button
                            key={award.id}
                            onClick={() => {
                              const current = state.selectedAwardIds || [];
                              const updated = isSelected
                                ? current.filter((id) => id !== award.id)
                                : [...current, award.id];
                              updateSectionState(section.mpa, { selectedAwardIds: updated });
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-all",
                              isSelected
                                ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
                                : "bg-muted/50 border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                            )}
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? "Remove" : "Add"} ${award.name}`}
                          >
                            <Trophy className={cn("size-3.5", isSelected ? "text-amber-500" : "text-muted-foreground/50")} />
                            <span className="truncate max-w-[220px]">
                              {award.type === "coin" && award.presenter
                                ? `${award.presenter} Coin${award.name && award.name !== "Coin" ? `: ${award.name}` : ""}`
                                : (() => {
                                    const lvlMap: Record<string, string> = { squadron: "Sq", group: "Gp", wing: "Wg", majcom: "MAJCOM", haf: "HAF" };
                                    const lvl = award.level ? (lvlMap[award.level] || award.level) : "";
                                    const typeLabel = award.type === "quarterly" ? "Qtr" : award.type === "annual" ? "Annual" : "";
                                    const period = award.quarter || "";
                                    const yr = award.awardYear ? ` '${String(award.awardYear).slice(-2)}` : "";
                                    const parts = [lvl, period, typeLabel].filter(Boolean).join(" ");
                                    return `${parts}${yr}${award.isTeamAward ? " (Team)" : ""}` || award.name;
                                  })()}
                            </span>
                            {award.level && (
                              <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-3.5", award.isTeamAward && "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300")}>
                                {(() => { const m: Record<string,string> = { squadron:"Sq", group:"Gp", wing:"Wg", majcom:"MAJCOM", haf:"HAF" }; return m[award.level!] || award.level; })()}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
                          allAccomplishments={accomplishments}
                          selectedIds={state.statement1ActionIds}
                          onSelectionChange={handleStatement1ActionsChange}
                          targetMpa={section.mpa}
                          statementNumber={state.usesTwoStatements ? 1 : undefined}
                          cycleYear={cycleYear}
                          trigger={
                            <button className="inline-flex items-center justify-center rounded-md h-7 px-3 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                              <Plus className="size-4 mr-1.5" />
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
                            allAccomplishments={accomplishments}
                            selectedIds={state.statement2ActionIds}
                            onSelectionChange={handleStatement2ActionsChange}
                            targetMpa={section.mpa}
                            statementNumber={2}
                            cycleYear={cycleYear}
                            trigger={
                              <button className="inline-flex items-center justify-center rounded-md h-7 px-3 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                                <Plus className="size-4 mr-1.5" />
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
                      <Crown className="size-5 text-amber-600 shrink-0 mt-0.5" />
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
                      <Loader2 className="size-5 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="size-5 mr-2" />
                    )}
                    Generate {generateVersionCount} Statement{generateVersionCount > 1 ? "s" : ""}
                    <TokenCostBadge compact className="ml-2 border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground" />
                  </button>
                </div>

                {/* Generated Statements - collapse smoothly after "Use This" */}
                <EpbAnimatedCollapse
                  visible={generatedStatements.length > 0 || isStatementsResultsClosing}
                  closing={isStatementsResultsClosing}
                  durationMs={EPB_GENERATED_RESULTS_CLOSE_MS}
                >
                  <div
                    ref={generatedStatementsResultsRef}
                    className={cn(
                      "space-y-4 pt-4 border-t animate-in fade-in-0 duration-300",
                      isStatementsResultsClosing && "pointer-events-none"
                    )}
                  >
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
                          <Users className="size-4" />
                          Collaborative editing
                        </span>
                      )}
                    </div>
                    {generatedStatements.map((statement, index) => (
                      <div
                        key={index}
                        data-epb-statement-item
                        className="p-4 rounded-lg border bg-background space-y-2.5 animate-in fade-in-0 duration-200"
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
                                  <Copy className="size-4 mr-1.5" />
                                  Copy
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy this statement</TooltipContent>
                            </Tooltip>
                            {/* Save this individual statement to examples */}
                            {onSaveExample && (() => {
                              const saved = isExampleSaved(statement);
                              const saving = savingExampleText === statement;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleSaveToExamples(statement, `Generated v${index + 1}`)}
                                      disabled={saved || saving}
                                      aria-label={saved ? "Saved to your examples" : "Save this statement to your examples"}
                                      className={cn(
                                        "h-6 px-2 rounded text-[10px] transition-colors inline-flex items-center",
                                        saved ? "text-primary cursor-default" : "hover:bg-muted disabled:opacity-50",
                                      )}
                                    >
                                      {saving ? (
                                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                                      ) : saved ? (
                                        <BookMarked className="size-4 mr-1.5" />
                                      ) : (
                                        <Bookmark className="size-4 mr-1.5" />
                                      )}
                                      {saved ? "Saved" : "Save"}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {saved ? "Saved to your examples" : "Save this statement to your examples"}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                            {/* Use This button - only when not locked */}
                            {!isLockedByOther && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleUseStatement(statement)}
                                    disabled={isUseThisClosing}
                                    className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center disabled:opacity-50"
                                  >
                                    <Check className="size-4 mr-1.5" />
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
                </EpbAnimatedCollapse>
              </div>
            )}
          </div>
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
              const regenAwards = state.selectedAwardIds?.length > 0
                ? rateeAwards.filter((a) => state.selectedAwardIds.includes(a.id))
                : undefined;
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
                clarifyingContext,
                selectedAwards: regenAwards,
              });
              console.log("[MPASectionCard] onGenerateStatement returned results:", results?.length);
              if (results?.length) {
                resizeCardBody(() => setGeneratedStatements(results), scrollGeneratedStatementsIntoView);
              }
            } catch (err) {
              console.error("[MPASectionCard] Regenerate with context error:", err);
            } finally {
              updateSectionState(section.mpa, { isGenerating: false });
            }
          }}
          isRegenerating={state.isGenerating}
        />
      )}

      {/* Prompt Settings Modal */}
      <PromptSettingsModal
        open={showPromptSettings}
        onOpenChange={setShowPromptSettings}
        rateeRank={rateeRank}
      />
    </Card>
  );
}
