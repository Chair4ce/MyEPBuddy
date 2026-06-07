"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  History,
  RotateCcw,
  Camera,
  CheckCircle2,
  Circle,
  Save,
  Edit2,
  Eye,
} from "lucide-react";
import { useOPBShellStore, type OPBWorkspaceMode } from "@/stores/opb-shell-store";
import type { OPBShellSection, OPBShellSnapshot, Accomplishment } from "@/types/database";

interface OPBSectionCardProps {
  mpaKey: string;
  mpaLabel: string;
  mpaDescription: string;
  section?: OPBShellSection;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (text: string) => Promise<void>;
  onCreateSnapshot: (text: string) => Promise<void>;
  onGenerate: (customContext: string) => Promise<string[]>;
  isGenerating: boolean;
  snapshots: OPBShellSnapshot[];
  onLoadSnapshots: () => void;
  maxCharacters: number;
  accomplishments?: Accomplishment[];
}

export function OPBSectionCard({
  mpaKey,
  mpaLabel,
  mpaDescription,
  section,
  isCollapsed,
  onToggleCollapse,
  onSave,
  onCreateSnapshot,
  onGenerate,
  isGenerating,
  snapshots,
  onLoadSnapshots,
  maxCharacters,
  accomplishments,
}: OPBSectionCardProps) {
  const { getSectionState, updateSectionState, initializeSectionState } =
    useOPBShellStore();

  const state = getSectionState(mpaKey);
  const { mode, draftText, isDirty, isSaving, showHistory } = state;

  const [copied, setCopied] = useState(false);
  const [customContext, setCustomContext] = useState("");
  const [showAccomplishments, setShowAccomplishments] = useState(false);
  const [selectedAccomplishmentIds, setSelectedAccomplishmentIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Filter and sort accomplishments for this MPA (or "miscellaneous" for any)
  // Officers don't have assessment scores, so sort by date (newest first)
  const relevantAccomplishments = (accomplishments || [])
    .filter(
      (a) => a.mpa === mpaKey || a.mpa === "miscellaneous" || mpaKey === "hlr_assessment"
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Initialize draft from section text
  useEffect(() => {
    if (section?.statement_text !== undefined) {
      initializeSectionState(mpaKey, section.statement_text);
    }
  }, [section?.id]);

  // Character count
  const charCount = draftText.length;
  const charColor = getCharacterCountColor(charCount, maxCharacters);
  const isOverLimit = charCount > maxCharacters;

  // Copy text
  const copyText = useCallback(() => {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }, [draftText]);

  // Handle text change
  const handleTextChange = useCallback(
    (value: string) => {
      updateSectionState(mpaKey, {
        draftText: value,
        isDirty: value !== (section?.statement_text || ""),
      });
    },
    [mpaKey, section, updateSectionState]
  );

  // Save changes
  const handleSave = useCallback(async () => {
    if (!isDirty) return;

    updateSectionState(mpaKey, { isSaving: true });
    try {
      await onSave(draftText);
      updateSectionState(mpaKey, { isDirty: false });
      toast.success("Saved");
    } finally {
      updateSectionState(mpaKey, { isSaving: false });
    }
  }, [mpaKey, draftText, isDirty, onSave, updateSectionState]);

  // Build context from selected accomplishments
  const buildContextFromAccomplishments = useCallback(() => {
    if (selectedAccomplishmentIds.length === 0) return "";
    
    const selected = relevantAccomplishments.filter((a) =>
      selectedAccomplishmentIds.includes(a.id)
    );
    
    return selected
      .map(
        (a) =>
          `[${a.action_verb}] ${a.details}${a.impact ? ` | Impact: ${a.impact}` : ""}${a.metrics ? ` | Metrics: ${a.metrics}` : ""}`
      )
      .join("\n\n");
  }, [selectedAccomplishmentIds, relevantAccomplishments]);

  // Generate statement
  const handleGenerate = useCallback(async () => {
    // Combine custom context with selected accomplishments
    const accomplishmentContext = buildContextFromAccomplishments();
    const fullContext = [accomplishmentContext, customContext]
      .filter((c) => c.trim())
      .join("\n\n---\n\n");
    
    const statements = await onGenerate(fullContext);
    if (statements.length > 0) {
      const newText = statements.join("\n\n");
      handleTextChange(newText);
      updateSectionState(mpaKey, { mode: "edit" });
    }
  }, [customContext, onGenerate, handleTextChange, mpaKey, updateSectionState, buildContextFromAccomplishments]);

  // Toggle accomplishment selection
  const toggleAccomplishment = useCallback((id: string) => {
    setSelectedAccomplishmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // Create snapshot
  const handleSnapshot = useCallback(async () => {
    if (!draftText.trim()) return;
    await onCreateSnapshot(draftText);
  }, [draftText, onCreateSnapshot]);

  // Restore snapshot
  const restoreSnapshot = useCallback(
    (snapshot: OPBShellSnapshot) => {
      handleTextChange(snapshot.statement_text);
      updateSectionState(mpaKey, { mode: "edit", showHistory: false });
    },
    [handleTextChange, mpaKey, updateSectionState]
  );

  // Toggle history
  const toggleHistory = useCallback(() => {
    const newShow = !showHistory;
    if (newShow) {
      onLoadSnapshots();
    }
    updateSectionState(mpaKey, { showHistory: newShow });
  }, [showHistory, onLoadSnapshots, mpaKey, updateSectionState]);

  // Set mode
  const setMode = useCallback(
    (newMode: OPBWorkspaceMode) => {
      updateSectionState(mpaKey, { mode: newMode });
    },
    [mpaKey, updateSectionState]
  );

  return (
    <Card className={cn("transition-all", isOverLimit && "border-destructive")}>
      {/* Header */}
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggleCollapse}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {section?.is_complete ? (
              <CheckCircle2 className="size-5 text-green-500" />
            ) : (
              <Circle className="size-5 text-muted-foreground" />
            )}
            <div>
              <h3 className="font-medium">{mpaLabel}</h3>
              {!isCollapsed && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {mpaDescription}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn("text-xs", charColor)}
            >
              {charCount}/{maxCharacters}
            </Badge>
            {isDirty && (
              <Badge variant="outline" className="text-xs text-amber-600">
                Unsaved
              </Badge>
            )}
            {isCollapsed ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {/* Content */}
      {!isCollapsed && (
        <CardContent className="pt-0 space-y-4">
          {/* Mode toggles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setMode("view")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  mode === "view"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Eye className="size-3.5 inline-block mr-1" />
                View
              </button>
              <button
                onClick={() => setMode("edit")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  mode === "edit"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Edit2 className="size-3.5 inline-block mr-1" />
                Edit
              </button>
              <button
                onClick={() => setMode("ai-assist")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  mode === "ai-assist"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="size-3.5 inline-block mr-1" />
                AI Assist
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={toggleHistory}
                  >
                    <History className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View History</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={handleSnapshot}
                    disabled={!draftText.trim()}
                  >
                    <Camera className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save Snapshot</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={copyText}
                    disabled={!draftText}
                  >
                    {copied ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* AI Assist Mode */}
          {mode === "ai-assist" && (
            <div className="space-y-3 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/50">
              {/* Load from Accomplishments */}
              {relevantAccomplishments.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAccomplishments(!showAccomplishments)}
                    className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    {showAccomplishments ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    Load from Entries ({relevantAccomplishments.length} available)
                    {selectedAccomplishmentIds.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedAccomplishmentIds.length} selected
                      </Badge>
                    )}
                  </button>
                  
                  {showAccomplishments && (
                    <div className="mt-2 max-h-[250px] overflow-y-auto space-y-1.5 border rounded-lg p-2 bg-background">
                      {relevantAccomplishments.map((acc) => (
                        <label
                          key={acc.id}
                          className={cn(
                            "flex items-start gap-2 p-2.5 rounded cursor-pointer transition-colors",
                            selectedAccomplishmentIds.includes(acc.id)
                              ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
                              : "hover:bg-muted/50 border border-transparent"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedAccomplishmentIds.includes(acc.id)}
                            onChange={() => toggleAccomplishment(acc.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                {acc.action_verb}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(acc.date).toLocaleDateString(undefined, { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: acc.date.slice(0, 4) !== new Date().getFullYear().toString() ? 'numeric' : undefined
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/80 line-clamp-2">
                              {acc.details}
                            </p>
                            {(acc.impact || acc.metrics) && (
                              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                                {acc.impact && <span>Impact: {acc.impact}</span>}
                                {acc.impact && acc.metrics && <span> • </span>}
                                {acc.metrics && <span>Metrics: {acc.metrics}</span>}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Custom Context */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Additional Context (optional)
                </label>
                <textarea
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  placeholder="Add any additional details, metrics, or specific guidance..."
                  className="w-full min-h-[60px] p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || (selectedAccomplishmentIds.length === 0 && !customContext.trim())}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Generate Statement
                    <TokenCostBadge compact className="ml-2 border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground" />
                  </>
                )}
              </Button>
              
              {selectedAccomplishmentIds.length === 0 && !customContext.trim() && (
                <p className="text-xs text-muted-foreground text-center">
                  Select entries or add context to generate
                </p>
              )}
            </div>
          )}

          {/* View Mode */}
          {mode === "view" && (
            <div
              className={cn(
                "min-h-[100px] p-4 rounded-lg border bg-muted/30",
                !draftText && "text-muted-foreground italic"
              )}
            >
              {draftText || "No statement yet. Switch to Edit or AI Assist mode."}
            </div>
          )}

          {/* Edit Mode */}
          {mode === "edit" && (
            <div className="space-y-3">
              <textarea
                ref={textareaRef}
                value={draftText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Write your performance statement here..."
                className={cn(
                  "w-full min-h-[120px] p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring",
                  isOverLimit && "border-destructive focus:ring-destructive"
                )}
              />
              {isDirty && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || isOverLimit}
                  >
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="size-4 mr-1" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* History Panel */}
          {showHistory && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Snapshot History</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => updateSectionState(mpaKey, { showHistory: false })}
                >
                  Close
                </Button>
              </div>
              {snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No snapshots yet. Use the camera icon to save a snapshot.
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="p-3 bg-background rounded border text-sm group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 flex-1">
                          {snapshot.statement_text}
                        </p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => restoreSnapshot(snapshot)}
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Restore</TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(snapshot.created_at).toLocaleString()}
                      </p>
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
