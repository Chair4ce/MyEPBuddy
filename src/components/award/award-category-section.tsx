"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Zap,
  FileText,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import type { Accomplishment, AwardLevel, AwardCategory, AwardShellSection } from "@/types/database";
import { useAwardShellStore } from "@/stores/award-shell-store";
import type { SectionSlotState } from "@/stores/award-shell-store";
import { compressText, normalizeSpaces, getVisualLineSegments, AF1206_LINE_WIDTH_PX } from "@/lib/bullet-fitting";

// ============================================================================
// Types
// ============================================================================

export type SourceType = "actions" | "custom";

interface SectionWithState {
  key: string;
  section: AwardShellSection;
  slotIndex: number;
  slotState?: SectionSlotState;
}

interface AwardCategorySectionProps {
  categoryKey: string;
  categoryLabel: string;
  categoryHeading: string;
  categoryDescription?: string;
  sections: SectionWithState[];
  accomplishments: Accomplishment[];
  nomineeRank: string;
  nomineeName: string;
  nomineeAfsc: string;
  awardLevel: AwardLevel;
  awardCategory: AwardCategory;
  model: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateSlotState: (category: string, slotIndex: number, updates: Partial<SectionSlotState>) => void;
  onAddSection: () => void;
  onRemoveSection: (slotIndex: number) => void;
}

// ============================================================================
// Source Toggle Component
// ============================================================================

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
    <div className="flex items-center gap-1 p-1 rounded-md bg-muted/50 border">
      <button
        onClick={() => onSourceChange("actions")}
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded text-xs transition-all",
          sourceType === "actions"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Zap className="size-3" />
        Actions
        {actionsCount > 0 && sourceType === "actions" && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-primary-foreground/20">
            {actionsCount}
          </Badge>
        )}
      </button>
      <button
        onClick={() => onSourceChange("custom")}
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded text-xs transition-all",
          sourceType === "custom"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <FileText className="size-3" />
        Custom
      </button>
    </div>
  );
}

// ============================================================================
// Statement Slot Component - EPB-style with stable layout
// ============================================================================

function StatementSlotCard({
  categoryKey,
  slotIndex,
  totalSlots,
  accomplishments,
  onRemove,
  onGenerate,
  isCollapsed,
  onToggleCollapse,
  model,
}: {
  categoryKey: string;
  slotIndex: number;
  totalSlots: number;
  accomplishments: Accomplishment[];
  onRemove: () => void;
  onGenerate: (revisionMode?: "add" | "replace", revisionIntensity?: number) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  model: string;
}) {
  // Subscribe directly to the store for this slot's state
  const slotKey = `${categoryKey}:${slotIndex}`;
  const storeSlotState = useAwardShellStore((state) => state.slotStates[slotKey]);
  const slotState = storeSlotState || {
    draftText: "",
    isDirty: false,
    isGenerating: false,
    isRevising: false,
    isSaving: false,
    sourceType: "actions" as const,
    customContext: "",
    selectedActionIds: [] as string[],
    linesPerStatement: 2 as 2 | 3,
  };
  const updateSlotState = useAwardShellStore((state) => state.updateSlotState);
  
  // Create a local onUpdate handler that uses the store directly
  const onUpdate = useCallback((updates: Partial<SectionSlotState>) => {
    updateSlotState(categoryKey, slotIndex, updates);
  }, [updateSlotState, categoryKey, slotIndex]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [generatedSuggestion, setGeneratedSuggestion] = useState<string | null>(null);
  
  // Selection popup state
  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [isRevising, setIsRevising] = useState(false);
  const [revisionResults, setRevisionResults] = useState<string[]>([]);
  
  // Revision mode: "add" fuses metrics together, "replace" uses source as total
  const [revisionMode, setRevisionMode] = useState<"add" | "replace">("add");
  
  // Revision intensity: 0-100, controls how much the statement gets rewritten
  // 0 = minimal changes (keep most original wording)
  // 100 = aggressive rewrite (replace most words)
  const [revisionIntensity, setRevisionIntensity] = useState(50);
  
  // Auto-resize textarea to fit content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set to scrollHeight to show all content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [slotState.draftText]);
  
  const handleCopy = async () => {
    if (!slotState.draftText) return;
    await navigator.clipboard.writeText(slotState.draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const relevantAccomplishments = accomplishments.filter(a => 
    slotState.selectedActionIds.includes(a.id)
  );

  const sourceType = slotState.sourceType || "actions";
  const selectedActionIds = slotState.selectedActionIds || [];
  const customContext = slotState.customContext || "";
  const draftText = slotState.draftText || "";
  const linesPerStatement = slotState.linesPerStatement || 2;
  const hasContent = draftText.trim().length > 0;
  const charCount = draftText.length;

  // Get visual line segments based on text width wrapping
  const visualLines = useMemo(() => {
    return getVisualLineSegments(draftText, AF1206_LINE_WIDTH_PX);
  }, [draftText]);
  
  // Check if a visual line is compressed (contains thin space)
  const isLineCompressed = (lineIndex: number) => {
    return visualLines[lineIndex]?.isCompressed || false;
  };

  // Toggle compact/normalize for a specific visual line
  const handleToggleLine = useCallback((lineIndex: number) => {
    const segments = getVisualLineSegments(draftText, AF1206_LINE_WIDTH_PX);
    if (lineIndex >= segments.length) return;
    
    const segment = segments[lineIndex];
    const lineText = segment.text;
    const isCompressed = lineText.includes('\u2006');
    
    let newLineText: string;
    if (isCompressed) {
      // Normalize this line segment
      newLineText = normalizeSpaces(lineText);
    } else {
      // Compress this line segment
      const { text: compressed } = compressText(lineText);
      newLineText = compressed;
    }
    
    // Reconstruct the full text with the modified segment
    const before = draftText.substring(0, segment.startIndex);
    const after = draftText.substring(segment.endIndex);
    const newText = before + newLineText + after;
    
    onUpdate({ draftText: newText, isDirty: true });
  }, [draftText, onUpdate]);

  // Handle AI generation - store result as suggestion, don't replace
  const handleGenerate = async () => {
    onUpdate({ isGenerating: true });
    try {
      // Pass revisionMode and intensity when there's existing content
      await onGenerate(
        hasContent ? revisionMode : undefined,
        hasContent ? revisionIntensity : undefined
      );
      // After generation, the draftText will be updated
      // For assistive mode, we could show as suggestion first
      // For now, just close the panel
      setShowAiPanel(false);
      setGeneratedSuggestion(null);
    } catch {
      toast.error("Failed to generate");
    } finally {
      onUpdate({ isGenerating: false });
    }
  };

  // Check if can generate
  const canGenerate = sourceType === "actions" 
    ? selectedActionIds.length > 0 
    : customContext.trim().length > 0;

  // Handle text selection for synonym/revision popup
  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = draftText.substring(start, end);
    
    if (text.trim().length > 0 && start !== end) {
      setSelectedText(text);
      setSelectionStart(start);
      setSelectionEnd(end);
      
      // Position popup near selection (simplified - appears below textarea)
      const rect = textarea.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + 8,
        left: rect.left + (rect.width / 2) - 150, // Center the 300px popup
      });
      setShowSelectionPopup(true);
      setRevisionResults([]);
    } else {
      setShowSelectionPopup(false);
    }
  };

  // Close selection popup
  const closeSelectionPopup = () => {
    setShowSelectionPopup(false);
    setSelectedText("");
    setRevisionResults([]);
  };

  // Revise selected text (expand, compress, or general)
  const handleReviseSelection = async (mode: "expand" | "compress" | "general") => {
    if (!selectedText.trim()) return;
    
    setIsRevising(true);
    setRevisionResults([]);
    
    try {
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: draftText,
          selectedText,
          selectionStart,
          selectionEnd,
          model,
          mode,
        }),
      });

      if (!response.ok) throw new Error("Revision failed");

      const data = await response.json();
      setRevisionResults(data.revisions || []);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error("Failed to revise selection");
    } finally {
      setIsRevising(false);
    }
  };

  // Apply a revision to the text
  const applyRevision = (revision: string) => {
    const newText = draftText.substring(0, selectionStart) + revision + draftText.substring(selectionEnd);
    onUpdate({ draftText: newText, isDirty: true });
    closeSelectionPopup();
    toast.success("Applied revision");
  };


  // AI-powered reshape (rewrite with different word lengths)
  const handleAiReshape = async (mode: "expand" | "compress") => {
    if (!draftText.trim()) return;
    
    onUpdate({ isRevising: true });
    
    try {
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: draftText,
          selectedText: draftText,
          selectionStart: 0,
          selectionEnd: draftText.length,
          model,
          mode,
          context: mode === "expand" 
            ? "Use longer, more descriptive words to fill more space on the 1206 form" 
            : "Use shorter, punchier words to save space on the 1206 form",
        }),
      });

      if (!response.ok) throw new Error("Reshape failed");

      const data = await response.json();
      if (data.revisions?.[0]) {
        onUpdate({ draftText: data.revisions[0], isDirty: true });
        toast.success(mode === "expand" ? "Words expanded" : "Words compressed");
      }
    } catch (error) {
      console.error("Reshape error:", error);
      toast.error("Failed to reshape statement");
    } finally {
      onUpdate({ isRevising: false });
    }
  };

  return (
    <div className="border rounded-lg bg-card/50 animate-in fade-in-0 duration-300 overflow-hidden">
      {/* Header Row - Clickable to collapse/expand */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleCollapse}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleCollapse(); }}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-medium">
            Statement {slotIndex + 1}
          </Badge>
          {/* Preview text when collapsed */}
          {isCollapsed && hasContent && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {draftText.slice(0, 50)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Character count badge when collapsed */}
          {isCollapsed && hasContent && (
            <Badge variant="secondary" className="text-[10px]">
              {charCount} chars
            </Badge>
          )}
          {/* Delete button - stop propagation */}
          {totalSlots > 1 && (
            <div onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-colors"
                onClick={onRemove}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
          {/* Collapse indicator */}
          {isCollapsed ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="size-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 pt-1 space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          {/* Master Workspace Textarea - Fixed 1206 dimensions with per-line controls */}
          <div className="space-y-2 relative">
            {/* Textarea + per-line compact buttons layout */}
            <div className="flex items-start gap-2">
              {/* Fixed-width container matching AF1206 form */}
              <div 
                className="border border-input rounded-md bg-muted/30 p-2 inline-block"
                style={{ width: 'fit-content' }}
              >
                <textarea
                  ref={textareaRef}
                  value={draftText}
                  onChange={(e) => onUpdate({ draftText: e.target.value, isDirty: true })}
                  onMouseUp={handleTextSelect}
                  onKeyUp={(e) => {
                    // Handle shift+arrow key selection
                    if (e.shiftKey) handleTextSelect();
                  }}
                  onBlur={() => {
                    // Delay closing popup to allow clicking on it
                    setTimeout(() => {
                      if (!document.activeElement?.closest('.selection-popup')) {
                        closeSelectionPopup();
                      }
                    }, 200);
                  }}
                  placeholder="Enter your statement here..."
                  className="bg-transparent focus:outline-none resize-none"
                  style={{
                    width: '765.95px',
                    minWidth: '765.95px',
                    maxWidth: '765.95px',
                    minHeight: '48px',
                    fontFamily: '"Times New Roman", Times, serif',
                    fontSize: '12pt',
                    lineHeight: '24px',
                    padding: 0,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                  rows={2}
              />
              </div>
              
              {/* Per-line compact/normalize toggles - based on visual line wrapping */}
              {visualLines.length > 0 && (
              <div 
                className="flex flex-col pt-2"
                style={{ gap: '0px' }}
              >
                {visualLines.map((segment, i) => {
                  const lineExists = segment.text.trim().length > 0;
                  const compressed = lineExists && isLineCompressed(i);
                  return (
                    <button
                      key={i}
                      onClick={() => handleToggleLine(i)}
                      disabled={!lineExists}
                      className={cn(
                        "text-[10px] px-1.5 rounded border transition-colors whitespace-nowrap",
                        !lineExists
                          ? "opacity-30 cursor-not-allowed bg-muted/30 text-muted-foreground border-border"
                          : compressed
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      )}
                      style={{ height: '24px', lineHeight: '22px' }}
                      title={!lineExists ? `Line ${i + 1} is empty` : compressed ? `Click to normalize line ${i + 1}` : `Click to compact line ${i + 1}`}
                    >
                      L{i + 1}: {compressed ? "Normal" : "Compact"}
                    </button>
                  );
                })}
              </div>
              )}
            </div>
        
        {/* Character count and copy button */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">{charCount} chars</span>
          <div className="flex items-center gap-1">
            {hasContent && (
              <button
                onClick={handleCopy}
                className="h-7 px-2 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center transition-colors"
              >
                {copied ? <Check className="size-3 mr-1 text-green-600" /> : <Copy className="size-3 mr-1" />}
                Copy
              </button>
            )}
          </div>
        </div>
        
        {/* Selection Popup - appears when text is selected */}
        {showSelectionPopup && (
          <div 
            className="selection-popup p-3 rounded-lg bg-card border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">&ldquo;{selectedText.slice(0, 30)}{selectedText.length > 30 ? "..." : ""}&rdquo;</span>
                  <span className="ml-1">({selectedText.length} chars)</span>
                </p>
                <button
                  onClick={closeSelectionPopup}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              
              {/* Revision mode buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReviseSelection("expand")}
                  disabled={isRevising}
                  className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isRevising ? <Loader2 className="size-3 animate-spin" /> : <Maximize2 className="size-3" />}
                  Expand
                </button>
                <button
                  onClick={() => handleReviseSelection("compress")}
                  disabled={isRevising}
                  className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isRevising ? <Loader2 className="size-3 animate-spin" /> : <Minimize2 className="size-3" />}
                  Compress
                </button>
                <button
                  onClick={() => handleReviseSelection("general")}
                  disabled={isRevising}
                  className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isRevising ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  Rephrase
                </button>
              </div>
              
              {/* Revision results */}
              {revisionResults.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs text-muted-foreground font-medium">Alternatives:</p>
                  {revisionResults.map((revision, index) => (
                    <button
                      key={index}
                      onClick={() => applyRevision(revision)}
                      className="w-full text-left p-2 rounded-md text-sm border hover:bg-accent hover:border-primary/50 transition-colors"
                    >
                      <p className="whitespace-pre-wrap">{revision}</p>
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {revision.length} chars ({revision.length > selectedText.length ? "+" : ""}{revision.length - selectedText.length})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Options Bar - below workspace */}
      <div className="flex items-center gap-2 pt-3 mt-3 border-t">
        {/* AI Assist button - when no content, or show "Revise" when has content */}
        <button
          onClick={() => {
            setShowAiPanel(!showAiPanel);
            setGeneratedSuggestion(null);
            // Scroll panel into view after it renders
            if (!showAiPanel) {
              setTimeout(() => {
                aiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }, 100);
            }
          }}
          className={cn(
            "h-7 px-3 rounded-md text-xs inline-flex items-center justify-center transition-all duration-200",
            showAiPanel
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {hasContent ? (
            <>
              <Wand2 className="size-3 mr-1.5" />
              Revise with AI
            </>
          ) : (
            <>
              <Sparkles className="size-3 mr-1.5" />
              AI Assist
            </>
          )}
        </button>
      </div>

      {/* AI Assist Panel - appears BELOW, doesn't shift textarea */}
      {showAiPanel && (
        <div 
          ref={aiPanelRef}
          className="mt-4 p-4 rounded-lg bg-muted/30 border animate-in fade-in-0 slide-in-from-top-2 duration-300"
        >
          <div className="space-y-4">
            {/* Revision Mode Toggle - only when there's existing content */}
            {hasContent && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Revision Mode:</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRevisionMode("add")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-all duration-200",
                      revisionMode === "add"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-semibold">Add Metrics</span>
                      <span className="text-[10px] opacity-80">Fuse source data with existing</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setRevisionMode("replace")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-all duration-200",
                      revisionMode === "replace"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-semibold">Replace Metrics</span>
                      <span className="text-[10px] opacity-80">Source data is the total</span>
                    </div>
                  </button>
                </div>
                
                {/* Revision Intensity Slider */}
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium text-muted-foreground">Rewrite Intensity:</Label>
                    <span className="text-xs font-medium tabular-nums">
                      {revisionIntensity < 25 ? "Minimal" : revisionIntensity < 50 ? "Light" : revisionIntensity < 75 ? "Moderate" : "Aggressive"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={revisionIntensity}
                      onChange={(e) => setRevisionIntensity(parseInt(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Keep wording</span>
                      <span>Full rewrite</span>
                    </div>
                  </div>
                </div>
                
                {/* Target Line Count */}
                <div className="pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">Target Length:</Label>
                    <div className="flex items-center gap-1 p-0.5 rounded bg-muted/50 border">
                      <button
                        onClick={() => onUpdate({ linesPerStatement: 2 })}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-medium transition-all duration-200",
                          linesPerStatement === 2
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        2-line (~240 chars)
                      </button>
                      <button
                        onClick={() => onUpdate({ linesPerStatement: 3 })}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-medium transition-all duration-200",
                          linesPerStatement === 3
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        3-line (~360 chars)
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    AI targets character count; use Compact/Normal buttons for exact fit
                  </p>
                </div>
              </div>
            )}

            {/* Source Toggle */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                {hasContent ? "Additional context from:" : "Generate from:"}
              </Label>
              <SourceToggle
                sourceType={sourceType}
                onSourceChange={(source) => onUpdate({ sourceType: source })}
                actionsCount={selectedActionIds.length}
              />
            </div>

            {/* Source Input */}
            {sourceType === "actions" ? (
              <div className="space-y-2">
                <Popover open={showActionSelector} onOpenChange={setShowActionSelector}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start h-auto py-2.5">
                      {selectedActionIds.length === 0 ? (
                        <span className="text-muted-foreground">Select performance actions...</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {relevantAccomplishments.slice(0, 3).map((a) => (
                            <Badge key={a.id} variant="secondary" className="text-xs">
                              {a.action_verb}
                            </Badge>
                          ))}
                          {selectedActionIds.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{selectedActionIds.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {accomplishments.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">No performance actions available</p>
                      ) : (
                        accomplishments.map((a) => {
                          const isSelected = selectedActionIds.includes(a.id);
                          return (
                            <button
                              key={a.id}
                              onClick={() => {
                                const newIds = isSelected
                                  ? selectedActionIds.filter(id => id !== a.id)
                                  : [...selectedActionIds, a.id];
                                onUpdate({ selectedActionIds: newIds });
                              }}
                              className={cn(
                                "w-full text-left p-2 rounded-md transition-colors",
                                isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-muted"
                              )}
                            >
                              <p className="text-sm font-medium">{a.action_verb}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{a.details}</p>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="pt-2 border-t mt-2">
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setShowActionSelector(false)}>
                        Done
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <Textarea
                value={customContext}
                onChange={(e) => onUpdate({ customContext: e.target.value })}
                placeholder="Paste your accomplishment paragraph or raw context here..."
                className="min-h-[80px] text-sm resize-none"
              />
            )}

            {/* Generated Suggestion Preview */}
            {generatedSuggestion && (
              <div className="p-3 rounded-md bg-background border animate-in fade-in-0 duration-200">
                <p className="text-sm mb-2">{generatedSuggestion}</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onUpdate({ draftText: generatedSuggestion, isDirty: true });
                      setGeneratedSuggestion(null);
                      setShowAiPanel(false);
                      toast.success("Applied to workspace");
                    }}
                  >
                    Use This
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setGeneratedSuggestion(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAiPanel(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={slotState.isGenerating || !canGenerate}
              >
                {slotState.isGenerating ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                {hasContent ? "Generate Revision" : "Generate Statement"}
              </Button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AwardCategorySectionCard({
  categoryKey,
  categoryLabel,
  categoryHeading,
  categoryDescription,
  sections,
  accomplishments,
  nomineeRank,
  nomineeName,
  nomineeAfsc,
  awardLevel,
  awardCategory,
  model,
  isCollapsed,
  onToggleCollapse,
  onUpdateSlotState,
  onAddSection,
  onRemoveSection,
}: AwardCategorySectionProps) {
  
  const generateStatement = useCallback(async (
    slotIndex: number, 
    slotState: SectionSlotState,
    revisionMode?: "add" | "replace",
    revisionIntensity?: number
  ) => {
    onUpdateSlotState(categoryKey, slotIndex, { isGenerating: true });
    
    // Use per-slot lines setting
    const linesForSlot = slotState.linesPerStatement || 2;
    const existingContent = slotState.draftText?.trim() || "";
    const hasExistingContent = existingContent.length > 0;
    
    try {
      const response = await fetch("/api/generate-award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomineeRank,
          nomineeAfsc,
          nomineeName,
          model,
          awardLevel,
          awardCategory,
          awardPeriod: new Date().getFullYear().toString(),
          versionsPerStatement: 1,
          sentencesPerStatement: linesForSlot,
          categoriesToGenerate: [categoryKey],
          // Revision mode and existing content for smart merging
          ...(hasExistingContent && {
            existingStatement: existingContent,
            revisionMode: revisionMode || "add",
            revisionIntensity: revisionIntensity ?? 50,
          }),
          ...(slotState.sourceType === "custom" 
            ? { customContext: slotState.customContext }
            : { accomplishments: accomplishments.filter(a => slotState.selectedActionIds.includes(a.id)).map(a => ({
                id: a.id,
                mpa: a.mpa,
                action_verb: a.action_verb,
                details: a.details,
                impact: a.impact,
                metrics: a.metrics,
                date: a.date,
              }))
            }
          ),
        }),
      });

      if (!response.ok) {
        throw new Error("Generation failed");
      }

      const data = await response.json();
      const generatedText = data.statements?.[0]?.statementGroups?.[0]?.versions?.[0] || "";
      
      onUpdateSlotState(categoryKey, slotIndex, { draftText: generatedText, isGenerating: false, isDirty: true });
      toast.success("Statement generated!");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to generate statement");
      onUpdateSlotState(categoryKey, slotIndex, { isGenerating: false });
    }
  }, [nomineeRank, nomineeAfsc, nomineeName, model, awardLevel, awardCategory, categoryKey, accomplishments, onUpdateSlotState]);

  const completedCount = sections.filter(s => s.slotState?.draftText?.trim()).length;

  // Track collapsed state for each statement slot
  const [collapsedSlots, setCollapsedSlots] = useState<Record<number, boolean>>({});
  
  const toggleSlotCollapse = (slotIndex: number) => {
    setCollapsedSlots(prev => ({
      ...prev,
      [slotIndex]: !prev[slotIndex]
    }));
  };

  // Default slot state for sections without state
  const getSlotState = (s: SectionWithState): SectionSlotState => {
    return s.slotState || {
      draftText: s.section.statement_text || "",
      isDirty: false,
      isGenerating: false,
      isRevising: false,
      isSaving: false,
      sourceType: (s.section.source_type || "actions") as SourceType,
      customContext: s.section.custom_context || "",
      selectedActionIds: s.section.selected_action_ids || [],
      linesPerStatement: s.section.lines_per_statement || 2,
    };
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{categoryLabel}</span>
                <Badge variant={completedCount > 0 ? "default" : "secondary"} className="text-xs">
                  {completedCount}/{sections.length}
                </Badge>
              </div>
              {categoryDescription && (
                <span className="text-xs text-muted-foreground mt-0.5">{categoryDescription}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {categoryHeading}
            </code>
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </div>
        </div>
      </CardHeader>

      {/* Content */}
      {!isCollapsed && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {/* Statement Slots */}
          {sections.map((s) => {
            return (
              <StatementSlotCard
                key={s.key}
                categoryKey={categoryKey}
                slotIndex={s.slotIndex}
                totalSlots={sections.length}
                accomplishments={accomplishments}
                isCollapsed={collapsedSlots[s.slotIndex] ?? false}
                onToggleCollapse={() => toggleSlotCollapse(s.slotIndex)}
                onRemove={() => onRemoveSection(s.slotIndex)}
                onGenerate={(revisionMode, revisionIntensity) => generateStatement(s.slotIndex, s.slotState || getSlotState(s), revisionMode, revisionIntensity)}
                model={model}
              />
            );
          })}

          {/* Add Statement Button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={onAddSection}
          >
            <Plus className="size-4" />
            Add Another Statement
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
