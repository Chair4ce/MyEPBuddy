"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { 
  useDecorationShellStore, 
  type DecorationSnapshot,
  HIGHLIGHT_COLORS,
  type HighlightColorId,
} from "@/stores/decoration-shell-store";
import { useUserStore } from "@/stores/user-store";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { DECORATION_TYPES } from "@/features/decorations/constants";
import {
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Camera,
  History,
  X,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  BookA,
  Palette,
  Highlighter,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Accomplishment } from "@/types/database";

interface DecorationCitationEditorProps {
  accomplishments: Accomplishment[];
  className?: string;
}

const MAX_SNAPSHOTS = 10;

export function DecorationCitationEditor({
  accomplishments,
  className,
}: DecorationCitationEditorProps) {
  const supabase = createClient();
  const { profile } = useUserStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    awardType,
    reason,
    dutyTitle,
    unit,
    startDate,
    endDate,
    citationText,
    setCitationText,
    selectedStatementIds,
    getSelectedAccomplishmentTexts,
    selectedRatee,
    selectedModel,
    currentShell,
    isGenerating,
    setIsGenerating,
    snapshots,
    setSnapshots,
    addSnapshot,
    removeSnapshot,
    showHistory,
    setShowHistory,
    citationHighlights,
    addCitationHighlight,
    removeCitationHighlight,
    clearCitationHighlights,
    statementColors,
    activeHighlightColor,
    setActiveHighlightColor,
  } = useDecorationShellStore();

  const [copied, setCopied] = useState(false);

  // Text selection state for highlight-to-revise
  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [revisionResults, setRevisionResults] = useState<string[]>([]);
  const [isRevisingSelection, setIsRevisingSelection] = useState(false);
  
  // Synonym state (for single-word selection)
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [isLoadingSynonyms, setIsLoadingSynonyms] = useState(false);
  
  // Track previous citation length to detect major changes
  const prevCitationLengthRef = useRef(citationText.length);
  
  // Clear highlights when citation text changes significantly (regeneration, major edits)
  useEffect(() => {
    const lengthDiff = Math.abs(citationText.length - prevCitationLengthRef.current);
    // If text changed by more than 50 characters, clear highlights as indices are likely invalid
    if (lengthDiff > 50 && citationHighlights.length > 0) {
      clearCitationHighlights();
    }
    prevCitationLengthRef.current = citationText.length;
  }, [citationText.length, citationHighlights.length, clearCitationHighlights]);
  
  // Check if selection is a single word (no spaces, reasonable length)
  const isSingleWord = useMemo(() => {
    const trimmed = selectedText.trim();
    return trimmed.length > 0 && 
           trimmed.length <= 30 && 
           !trimmed.includes(" ") &&
           /^[a-zA-Z-]+$/.test(trimmed);
  }, [selectedText]);

  // Get decoration config
  const decorationConfig = useMemo(() => {
    return DECORATION_TYPES.find((d) => d.key === awardType);
  }, [awardType]);

  const maxCharacters = decorationConfig?.maxCharacters || 1350;
  const characterCount = citationText.length;
  const characterPercent = Math.min((characterCount / maxCharacters) * 100, 100);
  const isOverLimit = characterCount > maxCharacters;

  // Load snapshots when shell changes
  useEffect(() => {
    async function loadSnapshots() {
      if (!currentShell?.id) return;

      const { data, error } = await supabase
        .from("decoration_shell_snapshots")
        .select("*")
        .eq("shell_id", currentShell.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading snapshots:", error);
        return;
      }

      setSnapshots((data || []) as DecorationSnapshot[]);
    }

    loadSnapshots();
  }, [currentShell?.id, supabase, setSnapshots]);

  // Create a snapshot
  const handleCreateSnapshot = useCallback(async () => {
    if (!currentShell?.id || !profile || !citationText.trim()) return;

    try {
      // If we already have max snapshots, delete the oldest one
      if (snapshots.length >= MAX_SNAPSHOTS) {
        const sortedSnapshots = [...snapshots].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const oldestSnapshot = sortedSnapshots[0];

        await supabase
          .from("decoration_shell_snapshots")
          .delete()
          .eq("id", oldestSnapshot.id);

        removeSnapshot(oldestSnapshot.id);
      }

      // Create new snapshot
      const { data, error } = await supabase
        .from("decoration_shell_snapshots")
        .insert({
          shell_id: currentShell.id,
          citation_text: citationText,
          created_by: profile.id,
        } as never)
        .select()
        .single();

      if (error) throw error;

      addSnapshot(data as DecorationSnapshot);
      toast.success("Snapshot saved");
    } catch (error) {
      console.error("Snapshot error:", error);
      toast.error("Failed to save snapshot");
    }
  }, [currentShell?.id, profile, citationText, snapshots, supabase, addSnapshot, removeSnapshot]);

  // Restore from snapshot
  const handleRestoreSnapshot = useCallback(
    (snapshot: DecorationSnapshot) => {
      setCitationText(snapshot.citation_text);
      setShowHistory(false);
      toast.success("Restored from snapshot");
    },
    [setCitationText, setShowHistory]
  );

  // Generate citation using API
  const handleGenerate = useCallback(async () => {
    if (selectedStatementIds.length === 0) {
      toast.error("Please select at least one accomplishment");
      return;
    }

    if (!selectedRatee) {
      toast.error("No ratee selected");
      return;
    }

    setIsGenerating(true);

    try {
      const accomplishmentTexts = getSelectedAccomplishmentTexts(accomplishments);

      const response = await fetch("/api/generate-decoration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId: selectedRatee.id,
          rateeRank: selectedRatee.rank || "",
          rateeName: selectedRatee.fullName || "",
          rateeGender: selectedRatee.gender,
          dutyTitle: dutyTitle || "member",
          unit: unit || "the organization",
          startDate: startDate || "",
          endDate: endDate || "",
          awardType,
          reason,
          accomplishments: accomplishmentTexts,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate citation");
      }

      const data = await response.json();
      setCitationText(data.citation);

      if (!data.metadata.withinLimit) {
        toast.warning(
          `Citation is ${data.metadata.characterCount} characters (${data.metadata.maxCharacters} max). Consider editing to shorten.`
        );
      } else {
        toast.success("Citation generated successfully");
      }
    } catch (error) {
      console.error("Generate error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate citation");
    } finally {
      setIsGenerating(false);
    }
  }, [
    selectedStatementIds,
    selectedRatee,
    accomplishments,
    dutyTitle,
    unit,
    startDate,
    endDate,
    awardType,
    reason,
    selectedModel,
    getSelectedAccomplishmentTexts,
    setCitationText,
    setIsGenerating,
  ]);

  // Handle text selection for popup (highlight text to get expand/compress/rephrase options)
  const handleTextSelect = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = citationText.substring(start, end);

    if (text.trim().length > 0 && start !== end) {
      setSelectedText(text);
      setSelectionStart(start);
      setSelectionEnd(end);
      setShowSelectionPopup(true);
      setRevisionResults([]);
    } else {
      setShowSelectionPopup(false);
    }
  }, [citationText]);

  // Close selection popup
  const closeSelectionPopup = useCallback(() => {
    setShowSelectionPopup(false);
    setSelectedText("");
    setRevisionResults([]);
    setSynonyms([]);
  }, []);
  
  // Fetch synonyms for a single word
  const handleFetchSynonyms = useCallback(async () => {
    if (!selectedText.trim() || !isSingleWord) return;
    
    setIsLoadingSynonyms(true);
    setSynonyms([]);
    
    try {
      const response = await fetch("/api/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: selectedText.trim(),
          fullStatement: citationText,
          model: selectedModel,
          context: "decoration", // Decoration-specific synonym suggestions
        }),
      });
      
      if (!response.ok) throw new Error("Failed to fetch synonyms");
      
      const data = await response.json();
      setSynonyms(data.synonyms || []);
    } catch (error) {
      console.error("Synonym error:", error);
      toast.error("Failed to get synonyms");
    } finally {
      setIsLoadingSynonyms(false);
    }
  }, [selectedText, isSingleWord, citationText, selectedModel]);
  
  // Apply a synonym replacement
  const applySynonym = useCallback(
    (synonym: string) => {
      const newText =
        citationText.substring(0, selectionStart) + synonym + citationText.substring(selectionEnd);
      setCitationText(newText);
      closeSelectionPopup();
      toast.success("Word replaced");
    },
    [citationText, selectionStart, selectionEnd, setCitationText, closeSelectionPopup]
  );
  
  // Apply highlight color to selected text
  const applyHighlightColor = useCallback(
    (colorId: HighlightColorId, statementId?: string) => {
      if (selectionStart === selectionEnd) return;
      
      addCitationHighlight({
        startIndex: selectionStart,
        endIndex: selectionEnd,
        colorId,
        statementId,
      });
      closeSelectionPopup();
      toast.success("Highlight added");
    },
    [selectionStart, selectionEnd, addCitationHighlight, closeSelectionPopup]
  );
  
  // Get highlight for a text range (for rendering)
  const getHighlightAtPosition = useCallback(
    (position: number) => {
      return citationHighlights.find(
        h => position >= h.startIndex && position < h.endIndex
      );
    },
    [citationHighlights]
  );
  
  // Render citation text with highlights
  const renderHighlightedText = useMemo(() => {
    if (citationHighlights.length === 0) return null;
    
    // Sort highlights by start index
    const sorted = [...citationHighlights].sort((a, b) => a.startIndex - b.startIndex);
    const segments: { text: string; highlight?: typeof citationHighlights[0] }[] = [];
    let lastIndex = 0;
    
    for (const hl of sorted) {
      // Skip highlights that overlap with already processed text
      if (hl.startIndex < lastIndex) {
        continue;
      }
      
      // Validate highlight indices are within bounds
      if (hl.startIndex >= citationText.length || hl.endIndex > citationText.length) {
        continue;
      }
      
      // Add non-highlighted text before this highlight
      if (hl.startIndex > lastIndex) {
        segments.push({ text: citationText.slice(lastIndex, hl.startIndex) });
      }
      // Add highlighted segment
      segments.push({ 
        text: citationText.slice(hl.startIndex, hl.endIndex),
        highlight: hl
      });
      lastIndex = hl.endIndex;
    }
    // Add remaining text
    if (lastIndex < citationText.length) {
      segments.push({ text: citationText.slice(lastIndex) });
    }
    
    return segments;
  }, [citationText, citationHighlights]);

  // Handle textarea blur - delay closing to allow button clicks
  const handleTextareaBlur = useCallback(() => {
    setTimeout(() => {
      // Don't close if actively revising or if focus is inside the popup
      if (document.activeElement?.closest(".selection-popup")) {
        return;
      }
      // Check the current revising/loading state via data attribute to avoid stale closure
      const loadingElement = document.querySelector('[data-loading="true"]');
      if (loadingElement) {
        return;
      }
      closeSelectionPopup();
    }, 300);
  }, [closeSelectionPopup]);

  // Revise selected text
  const handleReviseSelection = useCallback(
    async (mode: "expand" | "compress" | "general") => {
      // Capture values at call time to avoid stale closures
      const textToRevise = selectedText.trim();
      const fullText = citationText;
      const start = selectionStart;
      const end = selectionEnd;
      const model = selectedModel;
      
      if (!textToRevise) {
        console.warn("No text selected for revision");
        return;
      }

      setIsRevisingSelection(true);
      setRevisionResults([]);

      try {
        const response = await fetch("/api/revise-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullStatement: fullText,
            selectedText: textToRevise,
            selectionStart: start,
            selectionEnd: end,
            model: model,
            mode,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Revision failed");
        }

        const data = await response.json();
        setRevisionResults(data.revisions || []);
      } catch (error) {
        console.error("Revision error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to revise selection");
      } finally {
        setIsRevisingSelection(false);
      }
    },
    [selectedText, citationText, selectionStart, selectionEnd, selectedModel]
  );

  // Apply a revision to the text
  const applyRevision = useCallback(
    (revision: string) => {
      const newText =
        citationText.substring(0, selectionStart) + revision + citationText.substring(selectionEnd);
      setCitationText(newText);
      closeSelectionPopup();
      toast.success("Applied revision");
    },
    [citationText, selectionStart, selectionEnd, setCitationText, closeSelectionPopup]
  );

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!citationText) return;
    await navigator.clipboard.writeText(citationText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Citation copied to clipboard");
  }, [citationText]);

  // Clear citation
  const handleClear = useCallback(() => {
    setCitationText("");
  }, [setCitationText]);

  // Get aggressiveness label
  const getAggressivenessLabel = (value: number) => {
    if (value <= 20) return "Minimal";
    if (value <= 40) return "Conservative";
    if (value <= 60) return "Moderate";
    if (value <= 80) return "Aggressive";
    return "Maximum";
  };

  const getAggressivenessDescription = (value: number) => {
    if (value <= 20) return "Only fix obvious issues, preserve your voice";
    if (value <= 40) return "Light touch, replace only weak words";
    if (value <= 60) return "Balanced refresh with new phrasing";
    if (value <= 80) return "Substantial rewrite, keep only metrics";
    return "Complete rewrite, preserve only data";
  };

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Citation</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {decorationConfig?.name || "Decoration"} - {maxCharacters} character limit
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Clear highlights button */}
              {citationHighlights.length > 0 && (
                <AlertDialog>
                  <Tooltip>
                    <AlertDialogTrigger asChild>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground"
                        >
                          <Palette className="size-3 mr-1" />
                          Clear ({citationHighlights.length})
                        </Button>
                      </TooltipTrigger>
                    </AlertDialogTrigger>
                    <TooltipContent>Clear all highlights</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all citation highlights?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all {citationHighlights.length} highlight{citationHighlights.length > 1 ? "s" : ""} from your citation text. 
                        You can always re-highlight text afterward.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearCitationHighlights}>
                        Clear Highlights
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              
              {/* Snapshot button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCreateSnapshot}
                    disabled={!citationText.trim() || isGenerating}
                    className="h-8 w-8"
                  >
                    <Camera className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save snapshot</TooltipContent>
              </Tooltip>

              {/* History button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showHistory ? "default" : "outline"}
                    size="icon"
                    onClick={() => setShowHistory(!showHistory)}
                    className="h-8 w-8 relative"
                  >
                    <History className="size-4" />
                    {snapshots.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
                      >
                        {snapshots.length}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Snapshot history</TooltipContent>
              </Tooltip>

              {/* Generate button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || selectedStatementIds.length === 0}
                className="h-8"
              >
                {isGenerating ? (
                  <>
                    <Spinner size="sm" className="mr-1.5" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-1.5" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Character count bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Characters</span>
              <span
                className={cn(
                  "font-mono",
                  isOverLimit ? "text-destructive font-semibold" : "text-muted-foreground"
                )}
              >
                {characterCount} / {maxCharacters}
              </span>
            </div>
            <Progress
              value={characterPercent}
              className={cn("h-1.5", isOverLimit && "[&>div]:bg-destructive")}
            />
            {isOverLimit && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3" />
                <span>{characterCount - maxCharacters} characters over limit</span>
              </div>
            )}
          </div>

          {/* Snapshot History Panel - with smooth transition */}
          <div
            className={cn(
              "grid transition-all duration-300 ease-in-out",
              showHistory ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div className="rounded-lg border bg-card shadow-sm">
                <div className="p-3 border-b flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm">Snapshot History</h4>
                    <p className="text-xs text-muted-foreground">
                      {snapshots.length} snapshot{snapshots.length !== 1 && "s"} (max {MAX_SNAPSHOTS})
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowHistory(false)}
                    className="h-7 w-7"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <ScrollArea className="max-h-[300px]">
                  {snapshots.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      No snapshots yet. Click the camera icon to save your current citation.
                    </p>
                  ) : (
                    snapshots.map((snap) => (
                      <div key={snap.id} className="p-3 border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(snap.created_at).toLocaleString()}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreSnapshot(snap)}
                            className="h-6 px-2 text-xs shrink-0"
                          >
                            <RotateCcw className="size-3 mr-1" />
                            Restore
                          </Button>
                        </div>
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words font-mono bg-muted/30 p-2 rounded">
                          {snap.citation_text}
                        </p>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>

          {/* Citation textarea */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={citationText}
              onChange={(e) => setCitationText(e.target.value)}
              onMouseUp={handleTextSelect}
              onKeyUp={handleTextSelect}
              onBlur={handleTextareaBlur}
              placeholder={
                selectedStatementIds.length === 0
                  ? "Select accomplishments above, then click Generate to create a citation..."
                  : "Click Generate to create a citation based on selected accomplishments..."
              }
              className={cn(
                "min-h-[280px] font-mono text-sm resize-none",
                "focus-visible:ring-1 focus-visible:ring-primary",
                isOverLimit && "border-destructive focus-visible:ring-destructive"
              )}
              aria-label="Citation text editor"
            />
            {isGenerating && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-md">
                <div className="flex flex-col items-center gap-2">
                  <Spinner size="lg" />
                  <span className="text-sm text-muted-foreground">
                    Generating citation...
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Highlighted text preview - shows when highlights exist */}
          {renderHighlightedText && renderHighlightedText.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Highlighter className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  Highlighted Preview
                </span>
                <span className="text-[10px] text-muted-foreground">
                  (hover to match with statements)
                </span>
              </div>
              <div className="p-3 rounded-md border bg-muted/20 font-mono text-sm whitespace-pre-wrap break-words">
                {renderHighlightedText.map((segment, index) => {
                  if (segment.highlight) {
                    const colorConfig = HIGHLIGHT_COLORS.find(c => c.id === segment.highlight?.colorId);
                    const isActive = activeHighlightColor === segment.highlight.colorId;
                    return (
                      <span
                        key={index}
                        className={cn(
                          "px-0.5 rounded transition-all duration-200",
                          colorConfig?.bg,
                          colorConfig?.text,
                          isActive && "ring-2 ring-offset-1 ring-primary"
                        )}
                        onMouseEnter={() => setActiveHighlightColor(segment.highlight!.colorId)}
                        onMouseLeave={() => setActiveHighlightColor(null)}
                      >
                        {segment.text}
                      </span>
                    );
                  }
                  return <span key={index}>{segment.text}</span>;
                })}
              </div>
            </div>
          )}

          {/* Text Selection Popup - with smooth transition */}
          <div
            className={cn(
              "selection-popup grid transition-all duration-200 ease-in-out",
              showSelectionPopup ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
            )}
            data-loading={(isRevisingSelection || isLoadingSynonyms) ? "true" : "false"}
          >
            <div className="overflow-hidden">
              <div className="p-3 rounded-lg bg-card border shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Selected:{" "}
                      <span className="font-medium text-foreground">
                        &ldquo;{selectedText.slice(0, 50)}
                        {selectedText.length > 50 ? "..." : ""}&rdquo;
                      </span>
                      <span className="ml-1">({selectedText.length} chars)</span>
                      {isSingleWord && (
                        <span className="ml-1.5 text-[10px] text-primary">(word)</span>
                      )}
                    </p>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={closeSelectionPopup}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Single word: Show synonym button */}
                  {isSingleWord && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleFetchSynonyms}
                        disabled={isLoadingSynonyms}
                        className="w-full h-8 px-3 rounded-md text-xs border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isLoadingSynonyms ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <BookA className="size-3" />
                        )}
                        {isLoadingSynonyms ? "Finding synonyms..." : "Find Synonyms"}
                      </button>
                      
                      {/* Synonyms results */}
                      {synonyms.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                          {synonyms.map((synonym, index) => (
                            <button
                              key={index}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => applySynonym(synonym)}
                              className="px-2 py-1 rounded text-xs border bg-background hover:bg-accent hover:border-primary/50 transition-colors"
                            >
                              {synonym}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Multi-word/phrase: Show revision buttons */}
                  {!isSingleWord && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleReviseSelection("expand")}
                        disabled={isRevisingSelection}
                        className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isRevisingSelection ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Maximize2 className="size-3" />
                        )}
                        Expand
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleReviseSelection("compress")}
                        disabled={isRevisingSelection}
                        className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isRevisingSelection ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Minimize2 className="size-3" />
                        )}
                        Compress
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleReviseSelection("general")}
                        disabled={isRevisingSelection}
                        className="flex-1 h-8 px-3 rounded-md text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isRevisingSelection ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        Rephrase
                      </button>
                    </div>
                  )}

                  {/* Revision results - with smooth transition (only for multi-word) */}
                  <div
                    className={cn(
                      "grid transition-all duration-200 ease-in-out",
                      revisionResults.length > 0 && !isSingleWord ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs text-muted-foreground font-medium">Alternatives:</p>
                        {revisionResults.map((revision, index) => (
                          <button
                            key={index}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyRevision(revision)}
                            className="w-full text-left p-2 rounded-md text-sm border hover:bg-accent hover:border-primary/50 transition-colors"
                          >
                            <p className="whitespace-pre-wrap">{revision}</p>
                            <span className="text-[10px] text-muted-foreground mt-1">
                              {revision.length} chars (
                              {revision.length > selectedText.length ? "+" : ""}
                              {revision.length - selectedText.length})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Highlight color picker - always available */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Highlighter className="size-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground shrink-0">Highlight:</span>
                      <div className="flex flex-wrap gap-1">
                        {HIGHLIGHT_COLORS.map((color) => (
                          <button
                            key={color.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyHighlightColor(color.id)}
                            className={cn(
                              "size-5 rounded-full border-2 transition-all hover:scale-110",
                              color.bg,
                              "border-transparent hover:border-primary/50"
                            )}
                            aria-label={`Highlight with ${color.label}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TODO: Future work - Revise Panel (needs proper citation structure parsing)
          {citationText.trim() && (
            <Collapsible open={showRevisePanel} onOpenChange={setShowRevisePanel}>
              ...revise panel content...
            </Collapsible>
          )}
          */}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!citationText || isGenerating}
              className="h-8 text-xs"
            >
              <RotateCcw className="size-3 mr-1.5" />
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!citationText || isGenerating}
              className="h-8"
            >
              {copied ? (
                <>
                  <Check className="size-4 mr-1.5 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>

          {/* Info badges */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Badge variant="outline" className="text-xs">
              {decorationConfig?.abbreviation || awardType.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {decorationConfig?.afForm || "AF Form"}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Courier New 11pt
            </Badge>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
