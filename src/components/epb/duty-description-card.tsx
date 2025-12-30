"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Sparkles,
  Copy,
  Check,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Briefcase,
} from "lucide-react";
import { useEPBShellStore } from "@/stores/epb-shell-store";

interface DutyDescriptionCardProps {
  currentDutyDescription: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onGenerateDutyDescription?: (context: string) => Promise<string[]>;
}

export function DutyDescriptionCard({
  currentDutyDescription,
  isCollapsed,
  onToggleCollapse,
  onSave,
  onGenerateDutyDescription,
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
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiContext, setAIContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVersions, setGeneratedVersions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(currentDutyDescription);
  const aiPanelRef = useRef<HTMLDivElement>(null);

  // Initialize local text when store changes
  useEffect(() => {
    if (!isEditing && dutyDescriptionDraft !== localText) {
      setLocalText(dutyDescriptionDraft || currentDutyDescription || "");
    }
  }, [dutyDescriptionDraft, currentDutyDescription, isEditing]);

  // Sync with current duty description on mount
  useEffect(() => {
    if (currentDutyDescription && !dutyDescriptionDraft) {
      setLocalText(currentDutyDescription);
      setDutyDescriptionDraft(currentDutyDescription);
    }
  }, [currentDutyDescription, dutyDescriptionDraft, setDutyDescriptionDraft]);

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

  // Handle focus
  const handleTextFocus = () => {
    setIsEditing(true);
  };

  // Handle blur - save on blur
  const handleTextBlur = async () => {
    setIsEditing(false);
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

  // Generate duty description with AI
  const handleGenerate = async () => {
    if (!onGenerateDutyDescription || !aiContext.trim()) {
      toast.error("Please provide context for generation");
      return;
    }
    
    setIsGenerating(true);
    setGeneratedVersions([]);
    try {
      const results = await onGenerateDutyDescription(aiContext);
      if (results.length > 0) {
        setGeneratedVersions(results);
      } else {
        toast.error("No descriptions generated");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate description");
    } finally {
      setIsGenerating(false);
    }
  };

  // Use a generated version
  const handleUseVersion = (version: string) => {
    setLocalText(version);
    setDutyDescriptionDraft(version);
    setIsDutyDescriptionDirty(version !== currentDutyDescription);
    setGeneratedVersions([]);
    setShowAIPanel(false);
    setAIContext("");
    toast.success("Description applied");
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

          {/* AI Options Bar */}
          {onGenerateDutyDescription && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const opening = !showAIPanel;
                    setShowAIPanel(opening);
                    if (opening) {
                      setGeneratedVersions([]);
                      setTimeout(() => {
                        aiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }, 100);
                    }
                  }}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs inline-flex items-center justify-center transition-colors",
                    showAIPanel
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Sparkles className="size-3 mr-1" />
                  <span className="hidden sm:inline">AI Enhance</span>
                  <span className="sm:hidden">AI</span>
                </button>
              </div>
            </div>
          )}

          {/* AI Generate Panel */}
          {showAIPanel && onGenerateDutyDescription && (
            <div
              ref={aiPanelRef}
              className="rounded-lg border bg-muted/30 p-4 space-y-4 animate-in fade-in-0 duration-300"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Wand2 className="size-4" />
                  Enhance Duty Description
                </h4>
                <button
                  onClick={() => {
                    setShowAIPanel(false);
                    setGeneratedVersions([]);
                    setAIContext("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium">What to improve or add?</span>
                <textarea
                  value={aiContext}
                  onChange={(e) => setAIContext(e.target.value)}
                  placeholder="e.g., 'Make it more concise and impactful' or 'Add more detail about leadership scope and impact areas'"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !aiContext.trim()}
                className="w-full h-8 px-4 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="size-4 mr-2" />
                )}
                Generate Enhanced Version
              </button>

              {/* Generated Versions */}
              {generatedVersions.length > 0 && (
                <div className="space-y-3 pt-3 border-t animate-in fade-in-0 duration-300">
                  <h5 className="text-xs font-medium text-muted-foreground">
                    Generated Versions ({generatedVersions.length})
                  </h5>
                  {generatedVersions.map((version, index) => (
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
                                onClick={() => handleUseVersion(version)}
                                className="h-6 px-2 rounded text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 transition-colors inline-flex items-center"
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

