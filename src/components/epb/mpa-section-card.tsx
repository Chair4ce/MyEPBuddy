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
// Collapsible removed - caused ref loop issues with asChild pattern
// Popover removed - caused ref loop issues with asChild pattern
// Tooltip removed - caused ref loop issues with asChild pattern
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
  Pencil,
  History,
  Save,
  RotateCcw,
  Zap,
  FileText,
  Camera,
  Plus,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useEPBShellStore, type MPAWorkspaceMode, type SourceType } from "@/stores/epb-shell-store";
import { LoadedActionCard } from "./loaded-action-card";
import { ActionSelectorSheet } from "./action-selector-sheet";
// Per-section collaboration removed - using page-level collaboration instead
import type { EPBShellSection, EPBShellSnapshot, Accomplishment } from "@/types/database";

interface MPASectionCardProps {
  section: EPBShellSection;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onCreateSnapshot: (text: string, note?: string) => Promise<void>;
  onGenerateStatement: (options: GenerateOptions) => Promise<string | null>;
  onReviseStatement: (text: string, context?: string) => Promise<string | null>;
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
}

interface GenerateOptions {
  useAccomplishments: boolean;
  accomplishmentIds?: string[];
  customContext?: string;
  usesTwoStatements: boolean;
  statement1Context?: string;
  statement2Context?: string;
}

// Get MPA display info
function getMPAInfo(mpaKey: string) {
  const mpa = STANDARD_MGAS.find((m) => m.key === mpaKey);
  const isHLR = mpaKey === "hlr_assessment";
  const maxChars = isHLR ? MAX_HLR_CHARACTERS : MAX_STATEMENT_CHARACTERS;
  return { mpa, isHLR, maxChars };
}

// Mode selector component - SIMPLIFIED: Removed Tooltip wrappers to fix ref loop
function ModeSelector({
  currentMode,
  onModeChange,
  isLockedByOther = false,
  lockedByInfo,
}: {
  currentMode: MPAWorkspaceMode;
  onModeChange: (mode: MPAWorkspaceMode) => void;
  isLockedByOther?: boolean;
  lockedByInfo?: { name: string; rank: string | null } | null;
}) {
  const lockedTitle = isLockedByOther && lockedByInfo
    ? `Locked by ${lockedByInfo.rank || ""} ${lockedByInfo.name}`
    : "";

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 border">
      <button
        onClick={() => onModeChange("view")}
        title="View current statement"
        className={cn(
          "px-2 py-1 text-xs rounded transition-colors",
          currentMode === "view"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        View
      </button>

      <button
        onClick={() => !isLockedByOther && onModeChange("edit")}
        title={isLockedByOther ? lockedTitle : "Manually edit statement"}
        disabled={isLockedByOther}
        className={cn(
          "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
          currentMode === "edit"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
          isLockedByOther && "opacity-50 cursor-not-allowed"
        )}
      >
        <Pencil className="size-3" />
        Edit
      </button>

      <button
        onClick={() => !isLockedByOther && onModeChange("ai-assist")}
        title={isLockedByOther ? lockedTitle : "Generate or revise with AI"}
        disabled={isLockedByOther}
        className={cn(
          "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
          currentMode === "ai-assist"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
          isLockedByOther && "opacity-50 cursor-not-allowed"
        )}
      >
        <Sparkles className="size-3" />
        AI Assist
      </button>
    </div>
  );
}

// Source toggle component
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
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border">
      <button
        onClick={() => onSourceChange("actions")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm transition-all",
          sourceType === "actions"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Zap className="size-4" />
        <span className="font-medium">Performance Actions</span>
        {actionsCount > 0 && sourceType === "actions" && (
          <Badge variant="secondary" className="text-[10px] bg-primary-foreground/20">
            {actionsCount}
          </Badge>
        )}
      </button>
      <button
        onClick={() => onSourceChange("custom")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm transition-all",
          sourceType === "custom"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <FileText className="size-4" />
        <span className="font-medium">Custom Context</span>
      </button>
    </div>
  );
}

// Default section state (for use when store state is undefined)
const DEFAULT_SECTION_STATE = {
  mode: "view" as MPAWorkspaceMode,
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
  usesTwoStatements: false,
  statement1Context: "",
  statement2Context: "",
  selectedAccomplishmentIds: [] as string[],
};

export function MPASectionCard({
  section,
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
}: MPASectionCardProps) {
  const { mpa, isHLR, maxChars } = getMPAInfo(section.mpa);
  
  // Subscribe to the specific section state from the store
  const sectionStates = useEPBShellStore((s) => s.sectionStates);
  const storedState = sectionStates[section.mpa];
  const updateSectionState = useEPBShellStore((s) => s.updateSectionState);
  const initializeSectionState = useEPBShellStore((s) => s.initializeSectionState);
  
  // Use local ref for autosave timer to avoid Zustand updates on every keystroke
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use stored state or defaults
  const state = storedState || DEFAULT_SECTION_STATE;
  
  const [copied, setCopied] = useState(false);
  const [showSnapshotNote, setShowSnapshotNote] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(section.statement_text);
  
  // LOCAL state for textarea - only syncs to Zustand on blur (like /award page)
  // This prevents constant re-renders during typing which causes ref composition loops
  const [localText, setLocalText] = useState(state.draftText);

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

  // Initialize state when section loads
  useEffect(() => {
    if (!state.draftText && section.statement_text) {
      initializeSectionState(section.mpa, section.statement_text);
      lastSavedRef.current = section.statement_text;
      setLocalText(section.statement_text);
    }
  }, [section.mpa, section.statement_text, state.draftText, initializeSectionState]);

  // Sync localText when state.draftText changes from external sources (collaboration, AI generation)
  // but only when NOT focused (user is typing)
  useEffect(() => {
    if (document.activeElement !== textareaRef.current && state.draftText !== localText) {
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

  // Use localText for display when in edit mode (for responsive character counting)
  const displayText = state.mode === "edit" ? localText : state.draftText;
  const charCount = displayText.length;
  const isOverLimit = charCount > maxChars;
  const hasContent = displayText.trim().length > 0;
  const hasUnsavedChanges = displayText !== section.statement_text;

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayText);
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

  // Create snapshot
  const handleCreateSnapshot = async () => {
    try {
      await onCreateSnapshot(state.draftText, snapshotNote || undefined);
      setSnapshotNote("");
      setShowSnapshotNote(false);
      toast.success("Snapshot created");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create snapshot");
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

  // Handle text change - UPDATE LOCAL STATE ONLY (like /award page)
  // Zustand is updated on blur to prevent constant re-renders
  const handleTextChange = (value: string) => {
    setLocalText(value);
  };

  // Sync local text to Zustand on blur
  const handleTextBlur = () => {
    updateSectionState(section.mpa, {
      draftText: localText,
      isDirty: localText !== section.statement_text,
    });
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
    try {
      // Combine action IDs from both statements
      const allActionIds = state.usesTwoStatements
        ? [...state.statement1ActionIds, ...state.statement2ActionIds]
        : state.statement1ActionIds;
      
      const result = await onGenerateStatement({
        useAccomplishments: state.sourceType === "actions" && allActionIds.length > 0,
        accomplishmentIds: allActionIds,
        customContext: state.sourceType === "custom" ? state.statement1Context : undefined,
        usesTwoStatements: state.usesTwoStatements,
        statement1Context: state.statement1Context,
        statement2Context: state.statement2Context,
      });
      if (result) {
        updateSectionState(section.mpa, {
          draftText: result,
          isDirty: true,
          mode: "edit",
        });
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate statement");
    } finally {
      updateSectionState(section.mpa, { isGenerating: false });
    }
  };

  // Revise statement with AI
  const handleRevise = async (context?: string) => {
    if (!state.draftText.trim()) {
      toast.error("No text to revise");
      return;
    }
    updateSectionState(section.mpa, { isRevising: true });
    try {
      const result = await onReviseStatement(state.draftText, context);
      if (result) {
        updateSectionState(section.mpa, {
          draftText: result,
          isDirty: true,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to revise statement");
    } finally {
      updateSectionState(section.mpa, { isRevising: false });
    }
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

  // Toggle actions panel
  const toggleActionsPanel = () => {
    updateSectionState(section.mpa, { actionsExpanded: !state.actionsExpanded });
  };

  // Check if we can generate
  const canGenerate = state.sourceType === "actions"
    ? (state.statement1ActionIds.length > 0 || (state.usesTwoStatements && state.statement2ActionIds.length > 0))
    : state.statement1Context.trim().length > 0;

  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-in-out",
        isHLR && "border-amber-300/30 dark:border-amber-700/30",
        hasUnsavedChanges && "ring-1 ring-amber-400/50",
        hasContent && !hasUnsavedChanges && "border-green-500/30"
      )}
    >
      {/* Header - NO Collapsible/Radix components to avoid ref issues */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <button 
            className="flex items-center gap-2 min-w-0 flex-1 text-left group"
            onClick={onToggleCollapse}
          >
            {isHLR && <Crown className="size-4 text-amber-600 shrink-0" />}
            <span className="font-medium text-sm truncate">
              {mpa?.label || section.mpa}
            </span>
            {/* Lock indicator for single-user mode */}
            {isLockedByOther && lockedByInfo && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
              >
                🔒 {lockedByInfo.rank || ""} {lockedByInfo.name.split(" ")[0]} editing
              </Badge>
            )}
            {hasContent && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] shrink-0",
                  isOverLimit && "bg-destructive/10 text-destructive"
                )}
              >
                {charCount}/{maxChars}
              </Badge>
            )}
            {isAutosaving && (
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-600/30 shrink-0 animate-pulse">
                Saving...
              </Badge>
            )}
            {hasUnsavedChanges && !isAutosaving && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/30 shrink-0">
                {enableAutosave ? "Editing..." : "Unsaved"}
              </Badge>
            )}
            {isCollapsed ? (
              <ChevronDown className="size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            ) : (
              <ChevronUp className="size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            )}
          </button>
          {/* Copy button */}
          {isCollapsed && hasContent && (
            <button
              className="inline-flex items-center justify-center rounded-md size-6 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={handleCopy}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </button>
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
        <CardContent className="pt-0 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Mode selector and actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <ModeSelector
                currentMode={state.mode}
                onModeChange={handleModeChange}
                isLockedByOther={isLockedByOther}
                lockedByInfo={lockedByInfo}
              />
              <div className="flex items-center gap-1">
                {/* History button - no Popover to avoid ref issues */}
                <button
                  className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setShowHistory(!showHistory)}
                  title="View snapshot history"
                >
                  <History className="size-3.5" />
                </button>

                {/* Snapshot button - simplified */}
                <button
                  className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  disabled={!hasContent}
                  onClick={() => setShowSnapshotNote(!showSnapshotNote)}
                  title="Save snapshot"
                >
                  <Camera className="size-3.5" />
                </button>
              </div>
            </div>

            {/* History Panel - inline dropdown */}
            {showHistory && (
              <div className="rounded-lg border bg-card shadow-lg animate-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b">
                  <h4 className="font-medium text-sm">Snapshot History</h4>
                  <p className="text-xs text-muted-foreground">
                    {snapshots.length} snapshot{snapshots.length !== 1 && "s"}
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {snapshots.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      No snapshots yet
                    </p>
                  ) : (
                    snapshots.map((snap) => (
                      <button
                        key={snap.id}
                        onClick={() => handleRestoreSnapshot(snap)}
                        className="w-full p-3 text-left hover:bg-muted/50 border-b last:border-0 transition-colors"
                      >
                        <p className="text-xs text-muted-foreground mb-1">
                          {new Date(snap.created_at).toLocaleString()}
                        </p>
                        {snap.note && (
                          <p className="text-xs font-medium mb-1">{snap.note}</p>
                        )}
                        <p className="text-sm line-clamp-2">{snap.statement_text}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Snapshot Note Panel - inline form */}
            {showSnapshotNote && (
              <div className="rounded-lg border bg-card shadow-lg p-3 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2">
                  <span className="text-xs font-medium">Snapshot note (optional)</span>
                  <input
                    type="text"
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    placeholder="e.g., Before revisions"
                    className="w-full px-2 py-1.5 text-sm border rounded-md"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={handleCreateSnapshot} 
                      className="flex-1 h-8 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center"
                    >
                      <Camera className="size-3.5 mr-1.5" />
                      Save Snapshot
                    </button>
                    <button 
                      onClick={() => setShowSnapshotNote(false)}
                      className="h-8 px-3 rounded-md text-sm font-medium border bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Mode */}
            {state.mode === "view" && (
              <div className="space-y-3">
                {hasContent ? (
                  <>
                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.draftText}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={cn("w-24 h-1.5 bg-primary/20 rounded-full overflow-hidden")}>
                        <div
                          className={cn("h-full bg-primary transition-all", isOverLimit && "bg-destructive")}
                          style={{ width: `${Math.min((charCount / maxChars) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="p-6 rounded-lg border-2 border-dashed text-center">
                    {isLockedByOther && lockedByInfo ? (
                      <p className="text-sm text-muted-foreground">
                        🔒 {lockedByInfo.rank || ""} {lockedByInfo.name.split(" ")[0]} is currently editing this section.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          No statement yet. Switch to Edit or AI Assist to add content.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleModeChange("edit")}
                            className="h-8 px-3 rounded-md text-sm font-medium border bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                          >
                            <Pencil className="size-3.5 mr-1.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleModeChange("ai-assist")}
                            className="h-8 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center"
                          >
                            <Sparkles className="size-3.5 mr-1.5" />
                            AI Assist
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Edit Mode - with loaded actions sidebar */}
            {state.mode === "edit" && (
              <div className="flex gap-4">
                {/* Main editing area */}
                <div className="flex-1 space-y-3">
                  <textarea
                    ref={textareaRef}
                    value={localText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onBlur={handleTextBlur}
                    placeholder={`Enter your ${mpa?.label || "statement"} here...`}
                    rows={5}
                    className={cn(
                      "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                      isOverLimit && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-24 h-1.5 bg-primary/20 rounded-full overflow-hidden")}>
                        <div
                          className={cn("h-full bg-primary transition-all", isOverLimit && "bg-destructive")}
                          style={{ width: `${Math.min((charCount / maxChars) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasUnsavedChanges && (
                        <button 
                          onClick={handleReset} 
                          className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                        >
                          <RotateCcw className="size-3 mr-1" />
                          Reset
                        </button>
                      )}
                      <button 
                        onClick={handleCopy} 
                        disabled={!hasContent}
                        className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {copied ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                        Copy
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={state.isSaving || isOverLimit || !hasUnsavedChanges}
                        className="h-7 px-2.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {state.isSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                        Save
                      </button>
                    </div>
                  </div>
                </div>

                {/* Loaded actions panel (collapsible) */}
                {totalLoadedActions > 0 && (
                  <div className={cn(
                    "transition-all duration-200",
                    state.actionsExpanded ? "w-64" : "w-8"
                  )}>
                    {state.actionsExpanded ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Loaded Actions ({totalLoadedActions})
                          </span>
                          <button 
                            onClick={toggleActionsPanel}
                            className="size-6 rounded-md hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                          >
                            <PanelLeftClose className="size-3" />
                          </button>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {statement1Actions.map((action) => (
                            <LoadedActionCard
                              key={action.id}
                              action={action}
                              statementNumber={state.usesTwoStatements ? 1 : undefined}
                              onRemove={() => removeStatement1Action(action.id)}
                              compact
                            />
                          ))}
                          {statement2Actions.map((action) => (
                            <LoadedActionCard
                              key={action.id}
                              action={action}
                              statementNumber={2}
                              onRemove={() => removeStatement2Action(action.id)}
                              compact
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={toggleActionsPanel}
                        className="size-8 rounded-md hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                      >
                        <PanelLeft className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* AI Assist Mode */}
            {state.mode === "ai-assist" && (
              <div className="space-y-4">
                {/* Source Toggle */}
                <SourceToggle
                  sourceType={state.sourceType}
                  onSourceChange={(source) => updateSectionState(section.mpa, { sourceType: source })}
                  actionsCount={mpaAccomplishments.length}
                />

                {/* Two-statement toggle */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
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
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
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
                          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={state.isGenerating || !canGenerate}
                  className="w-full h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                >
                  {state.isGenerating ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="size-4 mr-2" />
                  )}
                  Generate Statement
                </button>

                {/* Current draft preview */}
                {hasContent && (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Current Draft</span>
                      <button
                        onClick={() => handleRevise()}
                        disabled={state.isRevising}
                        className="h-6 px-2 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {state.isRevising ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <Wand2 className="size-3 mr-1" />
                        )}
                        Revise
                      </button>
                    </div>
                    <p className="text-sm">{state.draftText}</p>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <div className={cn("flex-1 h-1 bg-primary/20 rounded-full overflow-hidden")}>
                        <div
                          className={cn("h-full bg-primary transition-all", isOverLimit && "bg-destructive")}
                          style={{ width: `${Math.min((charCount / maxChars) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={cn("text-xs tabular-nums shrink-0", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
      )}

    </Card>
  );
}
