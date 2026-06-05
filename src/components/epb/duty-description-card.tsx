"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  History,
  Camera,
  Bookmark,
  BookMarked,
  Trash2,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useEPBShellStore } from "@/stores/epb-shell-store";
import type { DutyDescriptionSnapshot, DutyDescriptionExample, DutyDescriptionTemplate } from "@/types/database";
import { useStyleFeedback } from "@/hooks/use-style-feedback";
import { SaveDutyDescriptionTemplateDialog } from "./save-duty-description-template-dialog";
import { DutyDescriptionTemplatesPanel } from "./duty-description-templates-panel";
import { FileText } from "lucide-react";
import { getEpbZenModeClassName, ZEN_MODE_DUTY_DESCRIPTION_KEY } from "./epb-zen-mode";
import {
  EpbAnimatedCollapse,
  EPB_GENERATED_RESULTS_CLOSE_MS,
  EPB_PANEL_CLOSE_MS,
} from "./epb-animated-collapse";
import { animateEpbShellResize } from "./epb-resize-transition";
interface DutyDescriptionCardProps {
  currentDutyDescription: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onReviseStatement?: (text: string, context?: string, versionCount?: number, aggressiveness?: number) => Promise<string[]>;
  // Completion status
  isComplete?: boolean;
  onToggleComplete?: () => void;
  // Snapshots (history)
  snapshots?: DutyDescriptionSnapshot[];
  onCreateSnapshot?: (text: string) => Promise<void>;
  // Saved examples (shell-specific)
  savedExamples?: DutyDescriptionExample[];
  onSaveExample?: (text: string, note?: string) => Promise<void>;
  onDeleteExample?: (id: string) => Promise<void>;
  // Templates (reusable across team members)
  templates?: DutyDescriptionTemplate[];
  onSaveTemplate?: (data: {
    template_text: string;
    office_label: string | null;
    role_label: string | null;
    rank_label: string | null;
    note: string | null;
  }) => Promise<void>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  templateLabels?: {
    offices: string[];
    roles: string[];
    ranks: string[];
  };
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
  isComplete = false,
  onToggleComplete,
  snapshots = [],
  onCreateSnapshot,
  savedExamples = [],
  onSaveExample,
  onDeleteExample,
  templates = [],
  onSaveTemplate,
  onDeleteTemplate,
  templateLabels = { offices: [], roles: [], ranks: [] },
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

  const zenModeMpaKey = useEPBShellStore((s) => s.zenModeMpaKey);
  const setZenModeMpaKey = useEPBShellStore((s) => s.setZenModeMpaKey);

  const [copied, setCopied] = useState(false);
  // Initialize from prop (source of truth), not from store
  const [localText, setLocalText] = useState(currentDutyDescription || "");
  const [isEditing, setIsEditing] = useState(false);
  const [showRevisePanel, setShowRevisePanel] = useState(false);
  const [reviseContext, setReviseContext] = useState("");
  const [reviseVersionCount, setReviseVersionCount] = useState(3);
  const [reviseAggressiveness, setReviseAggressiveness] = useState(50);
  const [isRevising, setIsRevising] = useState(false);
  const [generatedRevisions, setGeneratedRevisions] = useState<string[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showExamplesPanel, setShowExamplesPanel] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRevisePanelClosing, setIsRevisePanelClosing] = useState(false);
  const [isRevisionsResultsClosing, setIsRevisionsResultsClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardBodyShellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>(currentDutyDescription);
  const revisePanelRef = useRef<HTMLDivElement>(null);
  const statementAreaRef = useRef<HTMLDivElement>(null);
  const generatedRevisionsResultsRef = useRef<HTMLDivElement>(null);
  const generatedRevisionsRef = useRef<string[]>([]);
  const zenExitGuardRef = useRef({
    showRevisePanel: false,
    isRevisePanelClosing: false,
    isRevisionsResultsClosing: false,
  });
  // Track if component is mounted to prevent blur handler from running after unmount
  const isMountedRef = useRef(true);
  
  // Set unmount flag
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Style learning feedback (non-blocking, fire-and-forget)
  const styleFeedback = useStyleFeedback();

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

  const scrollGeneratedRevisionsIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const resultsEl = generatedRevisionsResultsRef.current;
        if (!resultsEl) return;

        resultsEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        window.setTimeout(() => {
          const lastItem = resultsEl.querySelector<HTMLElement>("[data-epb-revision-item]:last-child");
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
  }, []);

  const resizeCardBody = useCallback((update: () => void, onComplete?: () => void) => {
    animateEpbShellResize(cardBodyShellRef.current, update, onComplete);
  }, []);

  generatedRevisionsRef.current = generatedRevisions;

  zenExitGuardRef.current = {
    showRevisePanel,
    isRevisePanelClosing,
    isRevisionsResultsClosing,
  };

  const isUseThisClosing = isRevisePanelClosing || isRevisionsResultsClosing;

  const enterZenMode = useCallback(() => {
    setZenModeMpaKey(ZEN_MODE_DUTY_DESCRIPTION_KEY);
  }, [setZenModeMpaKey]);

  const tryExitZenMode = useCallback(() => {
    requestAnimationFrame(() => {
      if (cardRef.current?.contains(document.activeElement)) return;
      const {
        showRevisePanel: reviseOpen,
        isRevisePanelClosing: reviseClosing,
        isRevisionsResultsClosing: revisionsClosing,
      } = zenExitGuardRef.current;
      if (reviseOpen || reviseClosing || revisionsClosing) return;
      if (useEPBShellStore.getState().zenModeMpaKey === ZEN_MODE_DUTY_DESCRIPTION_KEY) {
        setZenModeMpaKey(null);
      }
    });
  }, [setZenModeMpaKey]);

  const closeRevisePanelWithScroll = useCallback(() => {
    const hasRevisions = generatedRevisionsRef.current.length > 0;

    const closePanel = () => {
      setIsRevisePanelClosing(true);
      setTimeout(() => {
        animateEpbShellResize(cardBodyShellRef.current, () => {
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

  // Sync local text with prop when it changes (from shell load or realtime update)
  // This is the source of truth - always sync unless user is actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalText(currentDutyDescription || "");
      setDutyDescriptionDraft(currentDutyDescription || "");
    }
  }, [currentDutyDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  const charCount = localText.length;
  const isOverLimit = charCount > maxChars;
  const hasContent = localText.trim().length > 0;
  const hasUnsavedChanges = localText !== currentDutyDescription;

  // Handle text change
  const handleTextChange = (value: string) => {
    setLocalText(value);
    setDutyDescriptionDraft(value);
    setIsDutyDescriptionDirty(value !== currentDutyDescription);
  };

  // Handle focus - set presence (no blocking, just show who's editing)
  const handleTextFocus = async () => {
    setIsEditing(true);
    enterZenMode();
    
    // Set presence indicator (doesn't block other users)
    if (onAcquireLock) {
      await onAcquireLock();
    }
  };

  // Handle blur - clear presence and save
  const handleTextBlur = async () => {
    // Don't update state if component is unmounting (e.g., during member switch)
    if (!isMountedRef.current) return;
    
    setIsEditing(false);
    tryExitZenMode();
    
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
    await navigator.clipboard.writeText(localText);
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
    if (!onCreateSnapshot || !localText.trim()) return;
    setIsCreatingSnapshot(true);
    try {
      await onCreateSnapshot(localText);
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
    if (!onSaveExample || !localText.trim()) return;
    try {
      await onSaveExample(localText);
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

  // Apply a template
  const handleApplyTemplate = (text: string) => {
    setLocalText(text);
    setDutyDescriptionDraft(text);
    setIsDutyDescriptionDirty(text !== currentDutyDescription);
    setShowTemplatesPanel(false);
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
      const results = await onReviseStatement(localText, reviseContext || undefined, reviseVersionCount, reviseAggressiveness);
      if (results.length > 0) {
        resizeCardBody(() => setGeneratedRevisions(results), scrollGeneratedRevisionsIntoView);
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
    toast.success("Revision applied");
    
    // Track for style learning (fire-and-forget)
    styleFeedback.trackRevisionSelected({
      version: versionIndex + 1,
      totalVersions: generatedRevisions.length,
      charCount: version.length,
      category: "duty_description",
      aggressiveness: reviseAggressiveness,
    });

    closeRevisePanelWithScroll();
  };

  const handleToggleCollapse = () => {
    if (!isCollapsed) {
      textareaRef.current?.blur();
      if (useEPBShellStore.getState().zenModeMpaKey === ZEN_MODE_DUTY_DESCRIPTION_KEY) {
        setZenModeMpaKey(null);
      }
    }
    onToggleCollapse();
  };

  return (
    <Card
      ref={cardRef}
      data-epb-zen-focus={ZEN_MODE_DUTY_DESCRIPTION_KEY}
      onFocusCapture={!isCollapsed ? enterZenMode : undefined}
      onBlurCapture={!isCollapsed ? tryExitZenMode : undefined}
      className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden scroll-mt-20 gap-3 sm:gap-4 py-3 sm:py-5",
        "border-primary-300/30 dark:border-primary-700/30 bg-background dark:bg-muted/30",
        hasUnsavedChanges && "ring-1 ring-amber-400/50",
        isComplete && "border-green-500/30 bg-green-50/30 dark:bg-green-900/10",
        getEpbZenModeClassName(zenModeMpaKey, ZEN_MODE_DUTY_DESCRIPTION_KEY)
      )}
    >
      {/* Header */}
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <button
            className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 text-left group"
            onClick={handleToggleCollapse}
          >
            <span className="font-semibold text-base sm:text-lg truncate">
              Duty Description
            </span>
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
          {/* Completion toggle button */}
          {onToggleComplete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-md size-6 shrink-0 transition-colors",
                    isComplete
                      ? "text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete();
                  }}
                >
                  {isComplete ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isComplete ? "Mark as incomplete" : "Mark as complete"}</p>
              </TooltipContent>
            </Tooltip>
          )}
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
            {localText.slice(0, 100)}...
          </p>
        )}
      </CardHeader>

      {/* Content */}
      {!isCollapsed && (
        <CardContent className="pt-0 pb-4 sm:pb-5 animate-in slide-in-from-top-2 duration-200 px-4 sm:px-6">
          <div ref={cardBodyShellRef} className="space-y-4 sm:space-y-5">
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
          <div ref={statementAreaRef} className="space-y-3">
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
              <span className={cn("text-xs tabular-nums", getCharacterCountColor(charCount, maxChars))}>
                {charCount}/{maxChars}
              </span>
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
          <div className="flex items-center justify-between gap-2 pt-3 sm:pt-4 border-t">
            <div className="flex items-center gap-1.5">
              {/* Revise button - only show when there's content */}
              {hasContent && onReviseStatement && (
                <button
                  onClick={() => {
                    const opening = !showRevisePanel;
                    if (opening) {
                      resizeCardBody(() => {
                        setShowRevisePanel(true);
                        setShowHistoryPanel(false);
                        setShowExamplesPanel(false);
                        setShowTemplatesPanel(false);
                        setGeneratedRevisions([]);
                        enterZenMode();
                      }, () => {
                        setTimeout(() => {
                          revisePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 100);
                      });
                    } else {
                      handleCancelRevise();
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
                      resizeCardBody(() => {
                        setShowHistoryPanel(!showHistoryPanel);
                        setShowExamplesPanel(false);
                        setShowTemplatesPanel(false);
                        setShowRevisePanel(false);
                      });
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
                      resizeCardBody(() => {
                        setShowExamplesPanel(!showExamplesPanel);
                        setShowHistoryPanel(false);
                        setShowTemplatesPanel(false);
                        setShowRevisePanel(false);
                      });
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

              {/* Templates button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      resizeCardBody(() => {
                        setShowTemplatesPanel(!showTemplatesPanel);
                        setShowExamplesPanel(false);
                        setShowHistoryPanel(false);
                        setShowRevisePanel(false);
                      });
                    }}
                    className={cn(
                      "size-7 rounded-md inline-flex items-center justify-center transition-colors",
                      showTemplatesPanel
                        ? "bg-indigo-600 text-white"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                    aria-label="Saved templates"
                  >
                    <FileText className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Templates {templates.length > 0 && `(${templates.length})`}
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
                <div className="flex items-center gap-1.5">
                  {hasContent && onSaveTemplate && (
                    <button
                      onClick={() => setShowSaveTemplateDialog(true)}
                      className="h-7 px-2.5 rounded-md text-xs border border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 inline-flex items-center"
                      aria-label="Save as reusable template"
                    >
                      <FileText className="size-3 mr-1" />
                      <span className="hidden sm:inline">Save as Template</span>
                      <span className="sm:hidden">Template</span>
                    </button>
                  )}
                  {hasContent && onSaveExample && (
                    <button
                      onClick={handleSaveAsExample}
                      className="h-7 px-2.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center"
                    >
                      <Bookmark className="size-3 mr-1" />
                      <span className="hidden sm:inline">Save Current</span>
                      <span className="sm:hidden">Save</span>
                    </button>
                  )}
                </div>
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
                      className="p-4 border-b last:border-0"
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

          {/* Templates Panel */}
          {showTemplatesPanel && (
            <DutyDescriptionTemplatesPanel
              templates={templates}
              onApply={handleApplyTemplate}
              onDelete={onDeleteTemplate}
              onClose={() => resizeCardBody(() => setShowTemplatesPanel(false))}
            />
          )}

          {/* Revise Panel */}
          {onReviseStatement && (
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
              <EpbAnimatedCollapse
                visible={generatedRevisions.length > 0 || isRevisionsResultsClosing}
                closing={isRevisionsResultsClosing}
                durationMs={EPB_GENERATED_RESULTS_CLOSE_MS}
              >
                <div
                  ref={generatedRevisionsResultsRef}
                  className="space-y-4 pt-4 border-t animate-in fade-in-0 duration-300"
                >
                  <h5 className="text-xs font-medium text-muted-foreground">
                    Revisions ({generatedRevisions.length})
                  </h5>
                  {generatedRevisions.map((version, index) => (
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
                                disabled={isUseThisClosing}
                                className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center disabled:opacity-50"
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
              </EpbAnimatedCollapse>
              </div>
            </EpbAnimatedCollapse>
          )}
          </div>
        </CardContent>
      )}

      {/* Save Template Dialog */}
      {onSaveTemplate && (
        <SaveDutyDescriptionTemplateDialog
          open={showSaveTemplateDialog}
          onOpenChange={setShowSaveTemplateDialog}
          templateText={localText}
          onSave={onSaveTemplate}
          existingLabels={templateLabels}
        />
      )}
    </Card>
  );
}
