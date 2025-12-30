"use client";

import { useState, useEffect, useRef } from "react";
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
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_DUTY_DESCRIPTION_CHARACTERS } from "@/lib/constants";
import {
  Copy,
  Check,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Briefcase,
  History,
  Camera,
  Bookmark,
  BookMarked,
  Trash2,
} from "lucide-react";
import { useEPBShellStore } from "@/stores/epb-shell-store";
import type { DutyDescriptionSnapshot, DutyDescriptionExample } from "@/types/database";
import { useStyleFeedback } from "@/hooks/use-style-feedback";

interface DutyDescriptionCardProps {
  currentDutyDescription: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onReviseStatement?: (text: string, context?: string, versionCount?: number, aggressiveness?: number, fillToMax?: boolean) => Promise<string[]>;
  // Snapshots (history)
  snapshots?: DutyDescriptionSnapshot[];
  onCreateSnapshot?: (text: string) => Promise<void>;
  // Saved examples
  savedExamples?: DutyDescriptionExample[];
  onSaveExample?: (text: string, note?: string) => Promise<void>;
  onDeleteExample?: (id: string) => Promise<void>;
  // Lock props for single-user mode
  isLockedByOther?: boolean;
  lockedByInfo?: { name: string; rank: string | null } | null;
  onAcquireLock?: () => Promise<{ success: boolean; lockedBy?: string }>;
  onReleaseLock?: () => Promise<void>;
}

export function DutyDescriptionCard({
  currentDutyDescription,
  isCollapsed,
  onToggleCollapse,
  onSave,
  onReviseStatement,
  snapshots = [],
  onCreateSnapshot,
  savedExamples = [],
  onSaveExample,
  onDeleteExample,
  isLockedByOther = false,
  lockedByInfo,
  onAcquireLock,
  onReleaseLock,
}: DutyDescriptionCardProps) {
  const maxChars = MAX_DUTY_DESCRIPTION_CHARACTERS;
  
  // Get state from store
  const {
    dutyDescriptionDraft,
    isDutyDescriptionDirty,
    isSavingDutyDescription,
    setDutyDescriptionDraft,
    setIsDutyDescriptionDirty,
    setIsSavingDutyDescription,
  } = useEPBShellStore();

  const [copied, setCopied] = useState(false);
  const [localText, setLocalText] = useState(dutyDescriptionDraft || currentDutyDescription || "");
  const [isEditing, setIsEditing] = useState(false);
  const [showRevisePanel, setShowRevisePanel] = useState(false);
  const [reviseContext, setReviseContext] = useState("");
  const [reviseVersionCount, setReviseVersionCount] = useState(3);
  const [reviseAggressiveness, setReviseAggressiveness] = useState(50);
  const [reviseFillToMax, setReviseFillToMax] = useState(true);
  const [isRevising, setIsRevising] = useState(false);
  const [generatedRevisions, setGeneratedRevisions] = useState<string[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showExamplesPanel, setShowExamplesPanel] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(currentDutyDescription);
  const revisePanelRef = useRef<HTMLDivElement>(null);
  
  // Style learning feedback (non-blocking, fire-and-forget)
  const styleFeedback = useStyleFeedback();

  // Sync local text with prop when it changes (from shell load or realtime update)
  // This is the source of truth - always sync unless user is actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalText(currentDutyDescription || "");
      setDutyDescriptionDraft(currentDutyDescription || "");
    }
  }, [currentDutyDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayText = localText;
  const charCount = displayText.length;
  const isOverLimit = charCount > maxChars;
  const hasContent = displayText.trim().length > 0;
  const hasUnsavedChanges = displayText !== currentDutyDescription;

  // Handle text change
  const handleTextChange = (value: string) => {
    setLocalText(value);
    setDutyDescriptionDraft(value);
    setIsDutyDescriptionDirty(value !== currentDutyDescription);
  };

  // Handle focus - set presence (no blocking, just show who's editing)
  const handleTextFocus = async () => {
    setIsEditing(true);
    
    // Set presence indicator (doesn't block other users)
    if (onAcquireLock) {
      await onAcquireLock();
    }
  };

  // Handle blur - clear presence and save
  const handleTextBlur = async () => {
    setIsEditing(false);
    
    // Clear presence
    if (onReleaseLock) {
      await onReleaseLock();
    }
    
    // Auto-save on blur if changed
    if (localText !== currentDutyDescription && localText.length <= maxChars) {
      try {
        setIsSavingDutyDescription(true);
        await onSave(localText);
        lastSavedRef.current = localText;
        setIsDutyDescriptionDirty(false);
      } catch {
        console.error("Auto-save on blur failed");
      } finally {
        setIsSavingDutyDescription(false);
      }
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset to saved version
  const handleReset = () => {
    setLocalText(currentDutyDescription);
    setDutyDescriptionDraft(currentDutyDescription);
    setIsDutyDescriptionDirty(false);
  };

  // Create snapshot
  const handleCreateSnapshot = async () => {
    if (!onCreateSnapshot || !displayText.trim()) return;
    setIsCreatingSnapshot(true);
    try {
      await onCreateSnapshot(displayText);
      toast.success("Snapshot saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save snapshot");
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Apply a snapshot
  const handleApplySnapshot = (text: string) => {
    setLocalText(text);
    setDutyDescriptionDraft(text);
    setIsDutyDescriptionDirty(text !== currentDutyDescription);
    setShowHistoryPanel(false);
    toast.success("Snapshot applied");
  };

  // Save current as example
  const handleSaveAsExample = async () => {
    if (!onSaveExample || !displayText.trim()) return;
    try {
      await onSaveExample(displayText);
      toast.success("Saved to examples");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save example");
    }
  };

  // Apply an example
  const handleApplyExample = (text: string) => {
    setLocalText(text);
    setDutyDescriptionDraft(text);
    setIsDutyDescriptionDirty(text !== currentDutyDescription);
    setShowExamplesPanel(false);
    toast.success("Example applied");
  };

  // Revise duty description with AI
  const handleRevise = async () => {
    if (!onReviseStatement || !localText.trim()) {
      toast.error("Please enter a duty description to revise");
      return;
    }
    
    setIsRevising(true);
    setGeneratedRevisions([]);
    try {
      const results = await onReviseStatement(localText, reviseContext || undefined, reviseVersionCount, reviseAggressiveness, reviseFillToMax);
      if (results.length > 0) {
        setGeneratedRevisions(results);
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

  // Use a generated revision
  const handleUseRevision = (version: string, versionIndex: number) => {
    setLocalText(version);
    setDutyDescriptionDraft(version);
    setIsDutyDescriptionDirty(version !== currentDutyDescription);
    setGeneratedRevisions([]);
    setShowRevisePanel(false);
    setReviseContext("");
    toast.success("Revision applied");
    
    // Track for style learning (fire-and-forget)
    styleFeedback.trackRevisionSelected({
      version: versionIndex + 1,
      totalVersions: generatedRevisions.length,
      charCount: version.length,
      category: "duty_description",
      aggressiveness: reviseAggressiveness,
      fillToMax: reviseFillToMax,
    });
  };

  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden",
        "border-indigo-300/30 dark:border-indigo-700/30 bg-indigo-50/20 dark:bg-indigo-950/10",
        hasUnsavedChanges && "ring-1 ring-amber-400/50"
      )}
    >
      {/* Header */}
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <button
            className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 text-left group"
            onClick={onToggleCollapse}
          >
            <Briefcase className="size-3.5 sm:size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="font-medium text-xs sm:text-sm truncate">
              Duty Description
            </span>
            {hasContent && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[9px] sm:text-[10px] shrink-0 px-1 sm:px-1.5",
                  isOverLimit && "bg-destructive/10 text-destructive"
                )}
              >
                {charCount}/{maxChars}
              </Badge>
            )}
            {isSavingDutyDescription && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] text-blue-600 border-blue-600/30 shrink-0 animate-pulse px-1 sm:px-1.5">
                <span className="hidden sm:inline">Saving...</span>
                <span className="sm:hidden">...</span>
              </Badge>
            )}
            {hasUnsavedChanges && !isSavingDutyDescription && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] text-amber-600 border-amber-600/30 shrink-0 px-1 sm:px-1.5">
                <span className="hidden sm:inline">Editing...</span>
                <span className="sm:hidden">*</span>
              </Badge>
            )}
            {isCollapsed ? (
              <ChevronDown className="size-3.5 sm:size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            ) : (
              <ChevronUp className="size-3.5 sm:size-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
            )}
          </button>
          {/* Copy button when collapsed */}
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
            {displayText.slice(0, 100)}...
          </p>
        )}
      </CardHeader>

      {/* Content */}
      {!isCollapsed && (
        <CardContent className="pt-0 space-y-3 sm:space-y-4 animate-in slide-in-from-top-2 duration-200 px-3 sm:px-6">
          {/* Presence indicator - shows who else is editing (collaborative, not blocking) */}
          {isLockedByOther && lockedByInfo && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground">
              <div className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
              <span>
                {lockedByInfo.rank ? `${lockedByInfo.rank} ${lockedByInfo.name}` : lockedByInfo.name} is also editing
              </span>
            </div>
          )}
          
          {/* Textarea */}
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={(e) => handleTextChange(e.target.value)}
              onFocus={handleTextFocus}
              onBlur={handleTextBlur}
              placeholder='e.g., "Leads 36 Amn & 12 total force members directing 24/7 O&M of 730 enterprise domain controllers by administering & securing enterprise Directory Services on a $14B cyber weapon system..."'
              rows={5}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                isOverLimit && "border-destructive focus-visible:ring-destructive"
              )}
            />

            {/* Action bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={cn("w-24 h-1.5 bg-primary/20 rounded-full overflow-hidden")}>
                  <div
                    className={cn("h-full bg-indigo-500 transition-all", isOverLimit && "bg-destructive")}
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
          </div>

          {/* Tools Bar */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              {/* Revise button - only show when there's content */}
              {hasContent && onReviseStatement && (
                <button
                  onClick={() => {
                    const opening = !showRevisePanel;
                    setShowRevisePanel(opening);
                    setShowHistoryPanel(false);
                    setShowExamplesPanel(false);
                    if (opening) {
                      setGeneratedRevisions([]);
                      setTimeout(() => {
                        revisePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }, 100);
                    }
                  }}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs inline-flex items-center justify-center transition-colors",
                    showRevisePanel
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Wand2 className="size-3 mr-1" />
                  <span className="hidden sm:inline">Revise Statement</span>
                  <span className="sm:hidden">Revise</span>
                </button>
              )}
            </div>

            {/* Right side tools */}
            <div className="flex items-center gap-1">
              {/* History button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setShowHistoryPanel(!showHistoryPanel);
                      setShowExamplesPanel(false);
                      setShowRevisePanel(false);
                    }}
                    className={cn(
                      "size-7 rounded-md inline-flex items-center justify-center transition-colors",
                      showHistoryPanel
                        ? "bg-indigo-600 text-white"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <History className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  History {snapshots.length > 0 && `(${snapshots.length})`}
                </TooltipContent>
              </Tooltip>

              {/* Examples button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setShowExamplesPanel(!showExamplesPanel);
                      setShowHistoryPanel(false);
                      setShowRevisePanel(false);
                    }}
                    className={cn(
                      "size-7 rounded-md inline-flex items-center justify-center transition-colors",
                      showExamplesPanel
                        ? "bg-indigo-600 text-white"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
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
                    onClick={handleCreateSnapshot}
                    disabled={isCreatingSnapshot || !hasContent}
                    className="size-7 rounded-md inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isCreatingSnapshot ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Save snapshot</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* History Panel */}
          {showHistoryPanel && (
            <div className="rounded-lg border bg-muted/30 animate-in fade-in-0 duration-200">
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
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(snap.created_at).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(snap.description_text);
                              toast.success("Copied");
                            }}
                            className="h-5 px-1.5 rounded text-[10px] hover:bg-muted transition-colors"
                          >
                            <Copy className="size-3" />
                          </button>
                          <button
                            onClick={() => handleApplySnapshot(snap.description_text)}
                            className="h-5 px-1.5 rounded text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {snap.description_text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Examples Panel */}
          {showExamplesPanel && (
            <div className="rounded-lg border bg-muted/30 animate-in fade-in-0 duration-200">
              <div className="p-3 border-b flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Saved Examples</h4>
                  <p className="text-xs text-muted-foreground">
                    {savedExamples.length} example{savedExamples.length !== 1 && "s"} saved
                  </p>
                </div>
                {hasContent && onSaveExample && (
                  <button
                    onClick={handleSaveAsExample}
                    className="h-7 px-2.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center"
                  >
                    <Bookmark className="size-3 mr-1" />
                    Save Current
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {savedExamples.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground text-center">
                    No saved examples yet. Save your favorite duty descriptions here for reference.
                  </p>
                ) : (
                  savedExamples.map((example) => (
                    <div
                      key={example.id}
                      className="p-3 border-b last:border-0"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(example.created_at).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(example.example_text);
                              toast.success("Copied");
                            }}
                            className="h-5 px-1.5 rounded text-[10px] hover:bg-muted transition-colors"
                          >
                            <Copy className="size-3" />
                          </button>
                          <button
                            onClick={() => handleApplyExample(example.example_text)}
                            className="h-5 px-1.5 rounded text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                            Apply
                          </button>
                          {onDeleteExample && (
                            <button
                              onClick={() => onDeleteExample(example.id)}
                              className="h-5 px-1.5 rounded text-[10px] hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {example.example_text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Revise Panel */}
          {showRevisePanel && onReviseStatement && (
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
                  onClick={() => {
                    setShowRevisePanel(false);
                    setGeneratedRevisions([]);
                    setReviseContext("");
                  }}
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
                  onClick={handleRevise}
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

              {/* Generated Revisions */}
              {generatedRevisions.length > 0 && (
                <div className="space-y-3 pt-3 border-t animate-in fade-in-0 duration-300">
                  <h5 className="text-xs font-medium text-muted-foreground">
                    Revisions ({generatedRevisions.length})
                  </h5>
                  {generatedRevisions.map((version, index) => (
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
                                  navigator.clipboard.writeText(version);
                                  toast.success("Copied to clipboard");
                                  // Track copy for style learning
                                  styleFeedback.trackRevisionCopied({
                                    version: index + 1,
                                    text: version,
                                    category: "duty_description",
                                  });
                                }}
                                className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center"
                              >
                                <Copy className="size-3 mr-1" />
                                Copy
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Copy this version</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleUseRevision(version, index)}
                                className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center"
                              >
                                <Check className="size-3 mr-1" />
                                Use This
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Use this as your description</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <p className="text-sm select-text cursor-text whitespace-pre-wrap leading-relaxed">
                        {version}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <span className={cn("text-[10px] tabular-nums", getCharacterCountColor(version.length, maxChars))}>
                          {version.length}/{maxChars} chars
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
    </Card>
  );
}
