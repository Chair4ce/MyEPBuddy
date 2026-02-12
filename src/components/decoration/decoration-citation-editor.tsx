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
import { fetchWithRetry } from "@/lib/fetch-with-retry";
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
    removeCitationHighlight,
    clearCitationHighlights,
    statementColors,
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
  
  // Staged synonym state - for preview/toggle before applying
  const [stagedSynonym, setStagedSynonym] = useState<string | null>(null);
  const [originalWord, setOriginalWord] = useState<string>(""); // The original highlighted word
  const [synonymsLocked, setSynonymsLocked] = useState(false); // When true, popup stays open

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
  
  // Sync highlights locally using smart matching
  const syncHighlightsLocally = useCallback(() => {
    if (!citationText.trim() || Object.keys(statementColors).length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Get statements with colors assigned
    const coloredStmts = statements.filter(stmt => statementColors[stmt.id]);
    
    if (coloredStmts.length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Split citation into sentences
    const sentences = splitIntoSentences(citationText);
    
    if (sentences.length === 0) {
      clearCitationHighlights();
      return;
    }
    
    // Pre-compute numbers and keywords for each statement
    // RefinedStatement has a single 'statement' field containing the full text
    const statementData = coloredStmts.map(stmt => {
      return {
        stmt,
        colorId: statementColors[stmt.id],
        numbers: extractNumbers(stmt.statement),
        keywords: extractKeywords(stmt.statement),
      };
    });
    
    // Sort statements by how many unique numbers they have (more = easier to match = do first)
    statementData.sort((a, b) => b.numbers.length - a.numbers.length);
    
    // Track which sentences have been assigned
    const assignedSentences = new Set<number>();
    const newHighlights: Array<{ 
      startIndex: number; 
      endIndex: number; 
      colorId: HighlightColorId; 
      statementId: string;
      matchedText: string;
      keyNumbers: string[];
    }> = [];
    
    // For each statement, find the best matching sentence
    for (const { stmt, colorId, numbers, keywords } of statementData) {
      if (!colorId) continue;
      
      let bestSentenceIdx = -1;
      let bestScore = 0;
      
      for (let i = 0; i < sentences.length; i++) {
        if (assignedSentences.has(i)) continue;
        
        const score = scoreSentenceMatch(sentences[i].text, numbers, keywords);
        
        if (score > bestScore) {
          bestScore = score;
          bestSentenceIdx = i;
        }
      }
      
      // Only match if we have a reasonable score (at least one number match or 3+ keywords)
      if (bestSentenceIdx >= 0 && bestScore >= 3) {
        const sentence = sentences[bestSentenceIdx];
        assignedSentences.add(bestSentenceIdx);
        
        newHighlights.push({
          startIndex: sentence.start,
          endIndex: sentence.end,
          colorId,
          statementId: stmt.id,
          matchedText: sentence.text,
          keyNumbers: numbers,
        });
      }
    }
    
    // Sort highlights by position for consistent rendering
    newHighlights.sort((a, b) => a.startIndex - b.startIndex);
    
    // Clear and add new highlights
    clearCitationHighlights();
    newHighlights.forEach(h => addCitationHighlight(h));
  }, [citationText, statementColors, statements, splitIntoSentences, extractNumbers, extractKeywords, scoreSentenceMatch, clearCitationHighlights, addCitationHighlight]);
  
  // Ref always points to the latest syncHighlightsLocally — eliminates stale
  // closures when effects fire in different render cycles during page load.
  const syncHighlightsRef = useRef(syncHighlightsLocally);
  syncHighlightsRef.current = syncHighlightsLocally;

  // Debounce ref for citation text changes
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Immediate sync when statement colors or statements change (covers initial
  // page load where statementColors may arrive before statements finish loading)
  useEffect(() => {
    if (Object.keys(statementColors).length === 0) {
      clearCitationHighlights();
      return;
    }
    if (statements.length === 0 || !citationText.trim()) return;

    syncHighlightsRef.current();
  }, [statementColors, statements, clearCitationHighlights, citationText]);
  
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


  // Handle text selection for popup (highlight text to get expand/compress/rephrase options)
  const handleTextSelect = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = citationText.substring(start, end);

    if (text.trim().length > 0 && start !== end) {
      // If selecting a different word, reset synonym state to allow fresh search
      if (text.trim() !== selectedText.trim()) {
        setSynonyms([]);
        setStagedSynonym(null);
        setOriginalWord("");
        setSynonymsLocked(false);
        setRevisionResults([]);
      }
      
      setSelectedText(text);
      setSelectionStart(start);
      setSelectionEnd(end);
      setShowSelectionPopup(true);
    } else {
      // Clicking away without selection - close and reset everything
      if (showSelectionPopup) {
        // If we have a staged synonym, keep it (don't revert) but close the popup
        setShowSelectionPopup(false);
        setSelectedText("");
        setRevisionResults([]);
        setSynonyms([]);
        setStagedSynonym(null);
        setOriginalWord("");
        setSynonymsLocked(false);
      }
    }
  }, [citationText, selectedText, showSelectionPopup]);

  // Close selection popup and reset all synonym state (keeps current text as-is)
  const closeSelectionPopup = useCallback(() => {
    setShowSelectionPopup(false);
    setSelectedText("");
    setRevisionResults([]);
    setSynonyms([]);
    setStagedSynonym(null);
    setOriginalWord("");
    setSynonymsLocked(false);
  }, []);
  
  // Fetch synonyms for a single word
  const handleFetchSynonyms = useCallback(async () => {
    if (!selectedText.trim() || !isSingleWord) return;
    
    setIsLoadingSynonyms(true);
    setSynonyms([]);
    
    // Store the original word when fetching synonyms
    setOriginalWord(selectedText.trim());
    
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
      setSynonymsLocked(true); // Lock the popup open only after success
    } catch (error) {
      console.error("Synonym error:", error);
      toast.error("Failed to get synonyms");
      setOriginalWord(""); // Reset on error
    } finally {
      setIsLoadingSynonyms(false);
    }
  }, [selectedText, isSingleWord, citationText, selectedModel]);
  
  // Stage a synonym (toggle preview without final apply)
  const stageSynonym = useCallback(
    (synonym: string) => {
      // Get current word in the text (could be original or previously staged)
      const currentWord = stagedSynonym || originalWord;
      
      if (synonym === currentWord) {
        // Clicking the same word - unstage it (revert to original)
        if (stagedSynonym) {
          const newText = citationText.substring(0, selectionStart) + originalWord + citationText.substring(selectionStart + stagedSynonym.length);
          setCitationText(newText);
          setStagedSynonym(null);
        }
        return;
      }
      
      // Replace current word with new synonym
      const newText = citationText.substring(0, selectionStart) + synonym + citationText.substring(selectionStart + currentWord.length);
      setCitationText(newText);
      setStagedSynonym(synonym);
    },
    [citationText, selectionStart, stagedSynonym, originalWord, setCitationText]
  );
  
  // Apply the staged synonym (finalize and close)
  const applyStaged = useCallback(() => {
    if (stagedSynonym) {
      toast.success(`Replaced "${originalWord}" with "${stagedSynonym}"`);
    }
    // Clear state without reverting
    setShowSelectionPopup(false);
    setSelectedText("");
    setRevisionResults([]);
    setSynonyms([]);
    setStagedSynonym(null);
    setOriginalWord("");
    setSynonymsLocked(false);
  }, [stagedSynonym, originalWord]);
  
  // Cancel and revert to original word
  const cancelSynonym = useCallback(() => {
    if (stagedSynonym && originalWord) {
      // Revert to original
      const newText = citationText.substring(0, selectionStart) + originalWord + citationText.substring(selectionStart + stagedSynonym.length);
      setCitationText(newText);
    }
    // Clear state
    setShowSelectionPopup(false);
    setSelectedText("");
    setRevisionResults([]);
    setSynonyms([]);
    setStagedSynonym(null);
    setOriginalWord("");
    setSynonymsLocked(false);
  }, [citationText, selectionStart, stagedSynonym, originalWord, setCitationText]);
  
  // Legacy apply for revisions (multi-word) - kept for backward compatibility
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
      // Don't close if focus is inside the popup
      if (document.activeElement?.closest(".selection-popup")) {
        return;
      }
      // Check the current revising/loading state via data attribute to avoid stale closure
      const loadingElement = document.querySelector('[data-loading="true"]');
      if (loadingElement) {
        return;
      }
      // When blurring, just close the popup without reverting
      // Keep whatever word is currently staged in the text
      setShowSelectionPopup(false);
      setSelectedText("");
      setRevisionResults([]);
      setSynonyms([]);
      setStagedSynonym(null);
      setOriginalWord("");
      setSynonymsLocked(false);
    }, 300);
  }, []);

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
    !showSelectionPopup &&
    !isGenerating
  );

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
        const response = await fetchWithRetry("/api/revise-selection", {
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
              onMouseUp={handleTextSelect}
              onKeyUp={handleTextSelect}
              onFocus={() => setIsCitationFocused(true)}
              onBlur={() => {
                setIsCitationFocused(false);
                handleTextareaBlur();
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
                      onClick={synonymsLocked ? cancelSynonym : closeSelectionPopup}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close synonym suggestions"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Single word: Show synonym button */}
                  {isSingleWord && (
                    <div className="space-y-2">
                      {/* Only show Find Synonyms button if synonyms haven't been fetched yet */}
                      {!synonymsLocked && (
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
                      )}
                      
                      {/* Synonyms results - toggle buttons */}
                      {synonyms.length > 0 && (
                        <div className="space-y-3 pt-2 border-t">
                          {/* Current word indicator */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Original: <span className="font-medium text-foreground">&ldquo;{originalWord}&rdquo;</span>
                            </span>
                            {stagedSynonym && (
                              <span className="text-primary font-medium">
                                → &ldquo;{stagedSynonym}&rdquo;
                              </span>
                            )}
                          </div>
                          
                          {/* Synonym toggle buttons */}
                          <div className="flex flex-wrap gap-1.5">
                            {/* Original word button */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                if (stagedSynonym) {
                                  stageSynonym(originalWord);
                                }
                              }}
                              className={cn(
                                "px-2 py-1 rounded text-xs border transition-colors",
                                !stagedSynonym
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background hover:bg-accent hover:border-primary/50"
                              )}
                            >
                              {originalWord}
                            </button>
                            
                            {/* Synonym buttons */}
                            {synonyms.map((synonym, index) => (
                              <button
                                key={index}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => stageSynonym(synonym)}
                                className={cn(
                                  "px-2 py-1 rounded text-xs border transition-colors",
                                  stagedSynonym === synonym
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background hover:bg-accent hover:border-primary/50"
                                )}
                              >
                                {synonym}
                              </button>
                            ))}
                          </div>
                          
                          {/* Apply/Cancel buttons */}
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={cancelSynonym}
                              className="h-7 text-xs flex-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={applyStaged}
                              className="h-7 text-xs flex-1"
                            >
                              {stagedSynonym ? `Apply "${stagedSynonym}"` : "Keep Original"}
                            </Button>
                          </div>
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
