"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { 
  SectionCollaborationDialog, 
  CollaboratorsPanel, 
  EditingIndicator,
} from "./section-collaboration-dialog";
import { 
  useEPBSectionCollaboration, 
  type SectionWorkspaceState,
  type JoinRequest,
} from "@/hooks/use-epb-section-collaboration";
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

// Mode selector component
function ModeSelector({
  currentMode,
  onModeChange,
}: {
  currentMode: MPAWorkspaceMode;
  onModeChange: (mode: MPAWorkspaceMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 border">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModeChange("view")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors",
                currentMode === "view"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              View
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>View current statement</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModeChange("edit")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
                currentMode === "edit"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Pencil className="size-3" />
              Edit
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Manually edit statement</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModeChange("ai-assist")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
                currentMode === "ai-assist"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="size-3" />
              AI Assist
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Generate or revise with AI</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
}: MPASectionCardProps) {
  const { mpa, isHLR, maxChars } = getMPAInfo(section.mpa);
  
  // Subscribe to the specific section state from the store
  const sectionStates = useEPBShellStore((s) => s.sectionStates);
  const storedState = sectionStates[section.mpa];
  const updateSectionState = useEPBShellStore((s) => s.updateSectionState);
  const initializeSectionState = useEPBShellStore((s) => s.initializeSectionState);
  const setAutosaveTimer = useEPBShellStore((s) => s.setAutosaveTimer);
  const clearAutosaveTimer = useEPBShellStore((s) => s.clearAutosaveTimer);

  // Use stored state or defaults
  const state = storedState || DEFAULT_SECTION_STATE;
  
  const [copied, setCopied] = useState(false);
  const [showSnapshotNote, setShowSnapshotNote] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(section.statement_text);

  // Collaboration hook for real-time editing
  const collaboration = useEPBSectionCollaboration({
    sectionId: section.id,
    onStateChange: useCallback((collabState: SectionWorkspaceState) => {
      // When remote state changes, update local state
      if (collabState.draftText !== undefined) {
        updateSectionState(section.mpa, { draftText: collabState.draftText, isDirty: true });
      }
    }, [section.mpa, updateSectionState]),
    onParticipantJoin: useCallback((participant: { rank: string | null; fullName: string }) => {
      toast.success(`${participant.rank ? participant.rank + " " : ""}${participant.fullName} joined the session`);
    }, []),
    onParticipantLeave: useCallback((participantId: string) => {
      // Just show a generic message
      toast.info("A collaborator left the session");
    }, []),
    onJoinRequest: useCallback((request: { fullName: string; rank: string | null }) => {
      // Show toast notification for host
      toast.info(`${request.rank ? request.rank + " " : ""}${request.fullName} wants to join your session`, {
        duration: 10000,
      });
    }, []),
    onJoinApproved: useCallback(() => {
      // Switch to edit mode when approved
      updateSectionState(section.mpa, { mode: "edit" });
      toast.success("Your request was approved! You can now edit.");
      setShowCollabDialog(false);
    }, [section.mpa, updateSectionState]),
    onJoinRejected: useCallback(() => {
      toast.error("Your request to join was declined");
    }, []),
  });

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
    }
  }, [section.mpa, section.statement_text, state.draftText, initializeSectionState]);

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

  // Debounced autosave effect
  useEffect(() => {
    if (!enableAutosave || !state.isDirty) return;
    if (state.mode !== "edit") return;
    
    clearAutosaveTimer(section.mpa);
    
    const timer = setTimeout(() => {
      performAutosave(state.draftText);
    }, autosaveDelayMs);
    
    setAutosaveTimer(section.mpa, timer);
    
    return () => {
      clearTimeout(timer);
    };
  }, [state.draftText, state.isDirty, state.mode, enableAutosave, autosaveDelayMs, section.mpa, performAutosave, clearAutosaveTimer, setAutosaveTimer]);

  const charCount = state.draftText.length;
  const isOverLimit = charCount > maxChars;
  const hasContent = state.draftText.trim().length > 0;
  const hasUnsavedChanges = state.draftText !== section.statement_text;

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(state.draftText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Save changes
  const handleSave = async () => {
    if (isOverLimit) {
      toast.error(`Statement exceeds ${maxChars} character limit`);
      return;
    }
    updateSectionState(section.mpa, { isSaving: true });
    try {
      await onSave(state.draftText);
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

  // Handle text change with collaboration broadcasting
  const handleTextChange = (value: string) => {
    updateSectionState(section.mpa, {
      draftText: value,
      isDirty: value !== section.statement_text,
    });
    
    // Broadcast to collaborators if in a session
    if (collaboration.isInSession) {
      collaboration.broadcastState({ draftText: value });
    }
  };

  // Handle mode change with collaboration check
  const handleModeChange = async (newMode: MPAWorkspaceMode) => {
    // If switching to edit or AI mode, check for active sessions
    if (newMode === "edit" || newMode === "ai-assist") {
      const activeSession = await collaboration.checkActiveSession();
      
      if (activeSession && !activeSession.isOwnSession) {
        // Someone else is editing - show dialog
        setShowCollabDialog(true);
        return;
      }
      
      // Start editing session if not already in one
      if (!collaboration.isInSession && !activeSession?.isOwnSession) {
        await collaboration.startEditing({ draftText: state.draftText });
      }
    } else if (newMode === "view" && collaboration.isInSession) {
      // Leaving edit mode - leave the session
      await collaboration.leaveSession();
    }
    
    updateSectionState(section.mpa, { mode: newMode });
  };

  // Handle joining a collaboration session
  const handleJoinSession = async () => {
    const success = await collaboration.requestToJoin();
    // Don't immediately switch to edit mode - wait for approval
    // The mode will be switched when the join is approved via the onJoinApproved callback
    return success;
  };

  // Handle view only mode
  const handleViewOnly = () => {
    updateSectionState(section.mpa, { mode: "view" });
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
      <Collapsible open={!isCollapsed} onOpenChange={() => onToggleCollapse()}>
        {/* Header */}
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 min-w-0 flex-1 text-left group">
                {isHLR && <Crown className="size-4 text-amber-600 shrink-0" />}
                <span className="font-medium text-sm truncate">
                  {mpa?.label || section.mpa}
                </span>
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
            </CollapsibleTrigger>
            {/* Copy button moved outside CollapsibleTrigger */}
            {isCollapsed && hasContent && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={handleCopy}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            )}
          </div>
          {isCollapsed && hasContent && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-1 pl-6">
              {state.draftText.slice(0, 100)}...
            </p>
          )}
        </CardHeader>

        <CollapsibleContent className="animate-in slide-in-from-top-2 duration-200">
          <CardContent className="pt-0 space-y-4">
            {/* Editing indicator - show if someone else is editing */}
            {collaboration.activeSession && !collaboration.activeSession.isOwnSession && !collaboration.isInSession && (
              <EditingIndicator
                hostName={
                  collaboration.activeSession.hostRank
                    ? `${collaboration.activeSession.hostRank} ${collaboration.activeSession.hostFullName}`
                    : collaboration.activeSession.hostFullName || "Someone"
                }
                participantCount={collaboration.activeSession.participantCount}
                onClick={() => setShowCollabDialog(true)}
              />
            )}

            {/* Collaborators panel - show when in a session or when host has pending requests */}
            {(collaboration.isInSession || (collaboration.isHost && collaboration.joinRequests.length > 0)) && (
              <CollaboratorsPanel
                collaborators={collaboration.collaborators}
                sessionCode={collaboration.session?.session_code || null}
                isHost={collaboration.isHost}
                onLeave={collaboration.leaveSession}
                onEnd={collaboration.endSession}
                joinRequests={collaboration.joinRequests}
                mpaLabel={mpa?.label || section.mpa}
                onApproveRequest={collaboration.approveJoinRequest}
                onRejectRequest={collaboration.rejectJoinRequest}
              />
            )}

            {/* Mode selector and actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <ModeSelector
                currentMode={state.mode}
                onModeChange={handleModeChange}
              />
              <div className="flex items-center gap-1">
                <Popover open={showHistory} onOpenChange={setShowHistory}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <History className="size-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="left" className="w-72 p-0" align="start">
                    <div className="p-3 border-b">
                      <h4 className="font-medium text-sm">Snapshot History</h4>
                      <p className="text-xs text-muted-foreground">
                        {snapshots.length} snapshot{snapshots.length !== 1 && "s"}
                      </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
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
                  </PopoverContent>
                </Popover>

                <Popover open={showSnapshotNote} onOpenChange={setShowSnapshotNote}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" disabled={!hasContent}>
                      <Camera className="size-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-2">
                      <Label className="text-xs">Snapshot note (optional)</Label>
                      <input
                        type="text"
                        value={snapshotNote}
                        onChange={(e) => setSnapshotNote(e.target.value)}
                        placeholder="e.g., Before revisions"
                        className="w-full px-2 py-1.5 text-sm border rounded-md"
                      />
                      <Button size="sm" onClick={handleCreateSnapshot} className="w-full">
                        <Camera className="size-3.5 mr-1.5" />
                        Save Snapshot
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* View Mode */}
            {state.mode === "view" && (
              <div className="space-y-3">
                {hasContent ? (
                  <>
                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.draftText}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Progress
                        value={Math.min((charCount / maxChars) * 100, 100)}
                        className={cn("w-24 h-1.5", isOverLimit && "[&>*]:bg-destructive")}
                      />
                      <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="p-6 rounded-lg border-2 border-dashed text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      No statement yet. Switch to Edit or AI Assist to add content.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModeChange("edit")}
                      >
                        <Pencil className="size-3.5 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleModeChange("ai-assist")}
                      >
                        <Sparkles className="size-3.5 mr-1.5" />
                        AI Assist
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Edit Mode - with loaded actions sidebar */}
            {state.mode === "edit" && (
              <div className="flex gap-4">
                {/* Main editing area */}
                <div className="flex-1 space-y-3">
                  <Textarea
                    ref={textareaRef}
                    value={state.draftText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder={`Enter your ${mpa?.label || "statement"} here...`}
                    rows={5}
                    className={cn(
                      "resize-none text-sm transition-colors",
                      isOverLimit && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Math.min((charCount / maxChars) * 100, 100)}
                        className={cn("w-24 h-1.5", isOverLimit && "[&>*]:bg-destructive")}
                      />
                      <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasUnsavedChanges && (
                        <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
                          <RotateCcw className="size-3 mr-1" />
                          Reset
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs" disabled={!hasContent}>
                        {copied ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={state.isSaving || isOverLimit || !hasUnsavedChanges}
                        className="h-7 text-xs"
                      >
                        {state.isSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                        Save
                      </Button>
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
                          <Button variant="ghost" size="icon" className="size-6" onClick={toggleActionsPanel}>
                            <PanelLeftClose className="size-3" />
                          </Button>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={toggleActionsPanel}
                      >
                        <PanelLeft className="size-4" />
                      </Button>
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
                    <Label className="text-xs font-medium">Two Statements</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Generate two sentences sharing the {maxChars} character limit
                    </p>
                  </div>
                  <Switch
                    checked={state.usesTwoStatements}
                    onCheckedChange={(checked) => updateSectionState(section.mpa, { usesTwoStatements: checked })}
                  />
                </div>

                {/* Performance Actions source */}
                {state.sourceType === "actions" && (
                  <div className="space-y-3">
                    {/* Statement 1 actions */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">
                          {state.usesTwoStatements ? "Statement 1 Actions" : "Load Actions"}
                        </Label>
                        <ActionSelectorSheet
                          accomplishments={mpaAccomplishments}
                          selectedIds={state.statement1ActionIds}
                          onSelectionChange={handleStatement1ActionsChange}
                          targetMpa={section.mpa}
                          statementNumber={state.usesTwoStatements ? 1 : undefined}
                          cycleYear={cycleYear}
                          trigger={
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <Plus className="size-3 mr-1" />
                              {statement1Actions.length > 0 ? `${statement1Actions.length} Loaded` : "Load Actions"}
                            </Button>
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
                          <Label className="text-xs font-medium">Statement 2 Actions</Label>
                          <ActionSelectorSheet
                            accomplishments={mpaAccomplishments}
                            selectedIds={state.statement2ActionIds}
                            onSelectionChange={handleStatement2ActionsChange}
                            targetMpa={section.mpa}
                            statementNumber={2}
                            cycleYear={cycleYear}
                            trigger={
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <Plus className="size-3 mr-1" />
                                {statement2Actions.length > 0 ? `${statement2Actions.length} Loaded` : "Load Actions"}
                              </Button>
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
                      <Label className="text-xs font-medium">
                        {state.usesTwoStatements ? "Statement 1 Context" : "Custom Context"}
                      </Label>
                      <Textarea
                        value={state.statement1Context}
                        onChange={(e) => updateSectionState(section.mpa, { statement1Context: e.target.value })}
                        placeholder="Paste accomplishment details, metrics, impact, or any context for the AI to use..."
                        rows={3}
                        className="resize-none text-sm"
                      />
                    </div>
                    {state.usesTwoStatements && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs font-medium">Statement 2 Context</Label>
                        <Textarea
                          value={state.statement2Context}
                          onChange={(e) => updateSectionState(section.mpa, { statement2Context: e.target.value })}
                          placeholder="Context for the second statement..."
                          rows={3}
                          className="resize-none text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={state.isGenerating || !canGenerate}
                  className="w-full"
                >
                  {state.isGenerating ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="size-4 mr-2" />
                  )}
                  Generate Statement
                </Button>

                {/* Current draft preview */}
                {hasContent && (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Current Draft</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevise()}
                        disabled={state.isRevising}
                        className="h-6 text-xs"
                      >
                        {state.isRevising ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <Wand2 className="size-3 mr-1" />
                        )}
                        Revise
                      </Button>
                    </div>
                    <p className="text-sm">{state.draftText}</p>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Progress
                        value={Math.min((charCount / maxChars) * 100, 100)}
                        className={cn("flex-1 h-1", isOverLimit && "[&>*]:bg-destructive")}
                      />
                      <span className={cn("text-xs tabular-nums shrink-0", getCharacterCountColor(charCount, maxChars))}>
                        {charCount}/{maxChars}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Collaboration dialog for when someone else is editing */}
      <SectionCollaborationDialog
        isOpen={showCollabDialog}
        onClose={() => setShowCollabDialog(false)}
        activeSession={collaboration.activeSession}
        mpaLabel={mpa?.label || section.mpa}
        onJoinSession={handleJoinSession}
        onViewOnly={handleViewOnly}
        isJoining={collaboration.isLoading}
        joinStatus={collaboration.joinStatus}
      />
    </Card>
  );
}
