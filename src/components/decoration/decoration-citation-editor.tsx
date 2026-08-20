"use client";

import { useCallback, useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
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
import { useWordThesaurus } from "@/hooks/use-word-thesaurus";
import { WordThesaurusPopup } from "@/components/word-thesaurus/word-thesaurus-popup";
import {
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Camera,
  History,
  X,
  Palette,
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
import type { RefinedStatement } from "@/types/database";
import { formatDateTime } from "@/lib/format";

interface DecorationCitationEditorProps {
  statements: RefinedStatement[];
  className?: string;
}

const MAX_SNAPSHOTS = 10;

export function DecorationCitationEditor({
  statements,
  className,
}: DecorationCitationEditorProps) {
  const supabase = createClient();
  const { profile } = useUserStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    awardType,
    citationText,
    setCitationText,
    selectedStatementIds,
    selectedModel,
    currentShell,
    isGenerating,
    snapshots,
    setSnapshots,
    addSnapshot,
    removeSnapshot,
    showHistory,
    setShowHistory,
    citationHighlights,
    addCitationHighlight,
    clearCitationHighlights,
    statementColors,
    leftPaneMode,
    bulkStatements,
  } = useDecorationShellStore();

  const [copied, setCopied] = useState(false);
  const thesaurus = useWordThesaurus({
    model: selectedModel,
    documentContext: "decoration",
  });

  // Color overlay state — overlay is visible when not hovering/focused/editing
  const [isHoveringCitation, setIsHoveringCitation] = useState(false);
  const [isCitationFocused, setIsCitationFocused] = useState(false);
  
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
  
  // Helper: Extract all numbers from text (for matching)
  const extractNumbers = useCallback((text: string): string[] => {
    const matches = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || [];
    return matches.map(n => n.replace(/,/g, '')); // Normalize by removing commas
  }, []);
  
  // Helper: Extract significant words from text (removes common words)
  const extractKeywords = useCallback((text: string): string[] => {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'he', 'she', 'it', 'they', 'we', 'you', 'i', 'his', 'her', 'its',
      'their', 'our', 'your', 'my', 'this', 'that', 'these', 'those',
      'who', 'which', 'what', 'when', 'where', 'how', 'why', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
      'additionally', 'furthermore', 'finally', 'moreover', 'during', 'period'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }, []);
  
  // Helper: Check if a period is part of an abbreviation (not a sentence boundary)
  const isAbbreviationPeriod = useCallback((text: string, dotIndex: number): boolean => {
    // 1. Single-letter abbreviation pattern: "U.S.", "A.F.", "D.C."
    //    A single uppercase letter immediately before the period, preceded by
    //    whitespace, start of text, open paren, or another period.
    if (dotIndex > 0 && /[A-Z]/.test(text[dotIndex - 1])) {
      if (dotIndex === 1 || /[\s.,(]/.test(text[dotIndex - 2])) {
        return true;
      }
    }

    // 2. Decimal numbers: "99.7", "3.5" — digit on both sides of the period
    if (
      dotIndex > 0 &&
      dotIndex < text.length - 1 &&
      /\d/.test(text[dotIndex - 1]) &&
      /\d/.test(text[dotIndex + 1])
    ) {
      return true;
    }

    // 3. Common military/general abbreviations ending with a period
    const beforeDot = text.slice(Math.max(0, dotIndex - 10), dotIndex);
    const abbrevPattern =
      /(?:Mrs|Mr|Dr|Gen|Lt|Col|Sgt|Maj|Capt|Cpl|Pvt|Spc|SSgt|TSgt|MSgt|SMSgt|CMSgt|CMSAF|Jr|Sr|vs|etc|approx|dept|div|est|inc|govt|org|No|St|Ave|Blvd|Cdr|Cmdr|Adm|Brig|Ens|Pfc|Sq|Wg|Gp|Flt|Amn|SrA|A1C)$/i;
    if (abbrevPattern.test(beforeDot)) {
      return true;
    }

    return false;
  }, []);

  // Helper: Split citation into sentences
  const splitIntoSentences = useCallback((text: string): Array<{ start: number; end: number; text: string }> => {
    const sentences: Array<{ start: number; end: number; text: string }> = [];
    let sentenceStart = 0;
    
    // Skip leading whitespace
    while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
      sentenceStart++;
    }
    
    for (let i = sentenceStart; i < text.length; i++) {
      if (text[i] === ';') {
        // Semicolons are always sentence boundaries
        const sentenceEnd = i + 1;
        const sentenceText = text.slice(sentenceStart, sentenceEnd);
        
        if (sentenceText.trim().length > 10) {
          sentences.push({ start: sentenceStart, end: sentenceEnd, text: sentenceText });
        }
        
        sentenceStart = sentenceEnd;
        while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
          sentenceStart++;
        }
        i = sentenceStart - 1;
      } else if (text[i] === '.') {
        // Skip abbreviation periods — they don't end sentences
        if (isAbbreviationPeriod(text, i)) {
          continue;
        }
        
        const sentenceEnd = i + 1;
        const sentenceText = text.slice(sentenceStart, sentenceEnd);
        
        // Only add non-empty sentences
        if (sentenceText.trim().length > 10) {
          sentences.push({ start: sentenceStart, end: sentenceEnd, text: sentenceText });
        }
        
        // Move to next sentence, skipping whitespace
        sentenceStart = sentenceEnd;
        while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
          sentenceStart++;
        }
        i = sentenceStart - 1;
      }
    }

    // Capture any remaining text after the last sentence boundary
    if (sentenceStart < text.length) {
      const remaining = text.slice(sentenceStart).trim();
      if (remaining.length > 10) {
        sentences.push({ start: sentenceStart, end: text.length, text: text.slice(sentenceStart) });
      }
    }
    
    return sentences;
  }, [isAbbreviationPeriod]);
  
  // Helper: Score how well a sentence matches a refined statement
  const scoreSentenceMatch = useCallback((
    sentence: string,
    stmtNumbers: string[],
    stmtKeywords: string[]
  ): number => {
    const sentenceLower = sentence.toLowerCase();
    const sentenceNumbers = extractNumbers(sentence);
    
    let score = 0;
    
    // Numbers are the strongest signal - each matching number is worth a lot
    for (const num of stmtNumbers) {
      if (sentenceNumbers.includes(num)) {
        score += 15; // Very high weight for number matches
      }
    }
    
    // Keywords provide context
    for (const keyword of stmtKeywords) {
      if (sentenceLower.includes(keyword)) {
        score += 1;
      }
    }
    
    return score;
  }, [extractNumbers]);
  
  // Sync highlights locally using positional matching.
  // The LLM generates accomplishment sentences in the same order the statements
  // were selected (selectedStatementIds). We split the citation into sentences,
  // strip the opening/closing template sentences, then map the Nth narrative
  // sentence to the Nth selected+colored statement.
  const syncHighlightsLocally = useCallback(() => {
    if (!citationText.trim() || Object.keys(statementColors).length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Build an ordered list of colored statement IDs depending on mode.
    // In library mode, use selectedStatementIds order. In bulk mode, use
    // bulkStatements order (all are implicitly "selected").
    const orderedColoredIds = leftPaneMode === "bulk"
      ? bulkStatements.map(s => s.id).filter(id => statementColors[id])
      : selectedStatementIds.filter(id => statementColors[id]);
    
    if (orderedColoredIds.length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Helper to get statement text by ID for either mode
    const getStmtText = (id: string): string | null => {
      if (leftPaneMode === "bulk") {
        return bulkStatements.find(s => s.id === id)?.text ?? null;
      }
      return statements.find(s => s.id === id)?.statement ?? null;
    };
    
    // Split citation into sentences
    const allSentences = splitIntoSentences(citationText);
    
    if (allSentences.length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Filter out the opening and closing template sentences — these are
    // structural parts of the citation, not accomplishment content.
    const narrativeSentences = allSentences.filter(s => {
      const lower = s.text.toLowerCase().trim();
      if (lower.includes("distinguished")) return false;
      if (lower.includes("distinctive accomplishments") || lower.includes("reflect credit")) return false;
      return true;
    });
    
    if (narrativeSentences.length === 0) {
      clearCitationHighlights();
      return;
    }
    
    const newHighlights: Array<{ 
      startIndex: number; 
      endIndex: number; 
      colorId: HighlightColorId; 
      statementId: string;
      matchedText: string;
      keyNumbers: string[];
    }> = [];
    
    if (narrativeSentences.length >= orderedColoredIds.length) {
      const assignedSentences = new Set<number>();
      
      for (let stmtIdx = 0; stmtIdx < orderedColoredIds.length; stmtIdx++) {
        const stmtId = orderedColoredIds[stmtIdx];
        const stmtText = getStmtText(stmtId);
        if (!stmtText) continue;
        
        const colorId = statementColors[stmtId];
        if (!colorId) continue;
        
        const stmtNumbers = extractNumbers(stmtText);
        const stmtKeywords = extractKeywords(stmtText);
        
        let bestSentenceIdx = -1;
        let bestScore = -1;
        
        for (let i = 0; i < narrativeSentences.length; i++) {
          if (assignedSentences.has(i)) continue;
          
          let score = scoreSentenceMatch(narrativeSentences[i].text, stmtNumbers, stmtKeywords);
          if (i === stmtIdx) score += 2;
          
          if (score > bestScore) {
            bestScore = score;
            bestSentenceIdx = i;
          }
        }
        
        if (bestSentenceIdx >= 0) {
          const sentence = narrativeSentences[bestSentenceIdx];
          assignedSentences.add(bestSentenceIdx);
          
          newHighlights.push({
            startIndex: sentence.start,
            endIndex: sentence.end,
            colorId,
            statementId: stmtId,
            matchedText: sentence.text,
            keyNumbers: stmtNumbers,
          });
        }
      }
    } else {
      for (let i = 0; i < Math.min(narrativeSentences.length, orderedColoredIds.length); i++) {
        const stmtId = orderedColoredIds[i];
        const colorId = statementColors[stmtId];
        if (!colorId) continue;
        
        const sentence = narrativeSentences[i];
        const stmtText = getStmtText(stmtId);
        
        newHighlights.push({
          startIndex: sentence.start,
          endIndex: sentence.end,
          colorId,
          statementId: stmtId,
          matchedText: sentence.text,
          keyNumbers: stmtText ? extractNumbers(stmtText) : [],
        });
      }
    }
    
    newHighlights.sort((a, b) => a.startIndex - b.startIndex);
    
    clearCitationHighlights();
    newHighlights.forEach(h => addCitationHighlight(h));
  }, [citationText, statementColors, statements, selectedStatementIds, leftPaneMode, bulkStatements, splitIntoSentences, extractNumbers, extractKeywords, scoreSentenceMatch, clearCitationHighlights, addCitationHighlight]);
  
  // Ref always points to the latest syncHighlightsLocally — eliminates stale
  // closures when effects fire in different render cycles during page load.
  const syncHighlightsRef = useRef(syncHighlightsLocally);

  useLayoutEffect(() => {
    syncHighlightsRef.current = syncHighlightsLocally;
  }, [syncHighlightsLocally]);

  // Debounce ref for citation text changes
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Immediate sync when statement colors, statements, or bulk statements change
  useEffect(() => {
    if (Object.keys(statementColors).length === 0) {
      clearCitationHighlights();
      return;
    }
    const hasStatements = leftPaneMode === "bulk" ? bulkStatements.length > 0 : statements.length > 0;
    if (!hasStatements || !citationText.trim()) return;

    syncHighlightsRef.current();
  }, [statementColors, statements, bulkStatements, leftPaneMode, clearCitationHighlights, citationText]);
  
  // Debounced sync when citation text changes (user edits)
  useEffect(() => {
    if (Object.keys(statementColors).length === 0) return;
    if (!citationText.trim() || statements.length === 0) return;
    
    // Clear existing timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Debounce: wait 500ms after user stops typing before re-syncing
    syncTimeoutRef.current = setTimeout(() => {
      syncHighlightsRef.current();
    }, 500);
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationText]); // Only trigger on citation text changes
  
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

  // Sync overlay scroll position with textarea
  const handleCitationScroll = useCallback(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Determine if the color overlay should be visible
  // Hidden when: hovering, focused (editing), selection popup open, or generating
  const showColorOverlay = !!(
    renderHighlightedText &&
    renderHighlightedText.length > 0 &&
    !isHoveringCitation &&
    !isCitationFocused &&
    !thesaurus.open &&
    !isGenerating
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

  return (
    <TooltipProvider>
      <Card className={cn("flex flex-col", className)}>
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

            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
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
                            {formatDateTime(snap.created_at)}
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

          {/* Citation textarea with inline color overlay */}
          <div
            className="relative"
            onMouseEnter={() => setIsHoveringCitation(true)}
            onMouseLeave={() => setIsHoveringCitation(false)}
          >
            <Textarea
              ref={textareaRef}
              value={citationText}
              onChange={(e) => setCitationText(e.target.value)}
              onMouseUp={() =>
                thesaurus.handleTextSelect(textareaRef.current, {
                  text: citationText,
                  onChange: setCitationText,
                })
              }
              onKeyUp={(event) => {
                if (event.shiftKey || event.key.startsWith("Arrow")) {
                  thesaurus.handleTextSelect(textareaRef.current, {
                    text: citationText,
                    onChange: setCitationText,
                  });
                }
              }}
              onKeyDown={thesaurus.handleKeyDown}
              onFocus={() => setIsCitationFocused(true)}
              onBlur={() => {
                setIsCitationFocused(false);
                thesaurus.handleBlur();
              }}
              onScroll={handleCitationScroll}
              placeholder={
                selectedStatementIds.length === 0
                  ? "Select statements from your library, then click Generate to create a citation..."
                  : "Click Generate to create a citation based on selected statements..."
              }
              className={cn(
                "min-h-[280px] font-mono text-sm resize-none text-justify",
                "transition-colors duration-150 ease-in-out",
                "focus-visible:ring-1 focus-visible:ring-primary",
                isOverLimit && "border-destructive focus-visible:ring-destructive",
                showColorOverlay && "text-transparent"
              )}
              aria-label="Citation text editor"
            />

            {/* Color overlay — sits on top of textarea, hidden on hover/focus for editing */}
            {renderHighlightedText && renderHighlightedText.length > 0 && (
              <div
                ref={overlayRef}
                className={cn(
                  "absolute inset-[1px] pointer-events-none",
                  "rounded-[5px]",
                  "font-mono text-sm whitespace-pre-wrap break-words text-justify",
                  "overflow-hidden px-3 py-2",
                  "transition-opacity duration-150 ease-in-out",
                  showColorOverlay ? "opacity-100" : "opacity-0"
                )}
                aria-hidden="true"
              >
                {renderHighlightedText.map((segment, index) => {
                  if (segment.highlight) {
                    const colorConfig = HIGHLIGHT_COLORS.find(c => c.id === segment.highlight?.colorId);
                    return (
                      <span
                        key={index}
                        style={{ color: colorConfig?.hex }}
                        className="font-semibold"
                      >
                        {segment.text}
                      </span>
                    );
                  }
                  return <span key={index} className="text-foreground">{segment.text}</span>;
                })}
              </div>
            )}

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

          <WordThesaurusPopup thesaurus={thesaurus} />

          {/* TODO: Future work - Revise Panel (needs proper citation structure parsing)
          {citationText.trim() && (
            <Collapsible open={showRevisePanel} onOpenChange={setShowRevisePanel}>
              ...revise panel content...
            </Collapsible>
          )}
          */}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!citationText || isGenerating}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear citation text?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all citation text. You can restore a previous version from snapshot history if you have one saved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClear}>
                    Clear Citation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
