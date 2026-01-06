"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { parseStatement, combineSentences, type ParsedSentence } from "@/lib/sentence-utils";
import { getCharacterCountColor } from "@/lib/utils";
import { GripVertical } from "lucide-react";

// Re-export compatible type for drag-drop
export interface DraggedSentence {
  sentence: ParsedSentence;
  sourceMpa: string;
  sourceIndex: number;
}

interface SplitViewEditorProps {
  text: string;
  onChange: (text: string) => void;
  maxChars: number;
  disabled?: boolean;
  placeholder?: string;
  // Drag-drop props
  mpaKey?: string;
  onDragStart?: (data: DraggedSentence) => void;
  onDragEnd?: () => void;
  onDrop?: (data: DraggedSentence, targetIndex: number) => void;
  draggedSentence?: DraggedSentence | null;
  // Animation props
  isClosing?: boolean;
}

// Strip ALL periods from text (periods are added automatically when combining)
function stripAllPeriods(text: string): string {
  return text.replace(/\./g, "");
}

// Strip trailing period from a sentence (we'll add it back when combining)
function stripTrailingPeriod(text: string): string {
  const trimmed = text.trim();
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

export function SplitViewEditor({
  text,
  onChange,
  maxChars,
  disabled = false,
  placeholder = "Enter your statement here...",
  mpaKey,
  onDragStart,
  onDragEnd,
  onDrop,
  draggedSentence,
  isClosing = false,
}: SplitViewEditorProps) {
  // Local state for each sentence (stored WITHOUT trailing periods)
  const [sentence1, setSentence1] = useState("");
  const [sentence2, setSentence2] = useState("");
  
  // Drag state
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingFrom, setIsDraggingFrom] = useState<number | null>(null);
  
  // Track what we last synced to parent to avoid re-sync loops
  const lastSyncedRef = useRef<string>("");
  
  // Track if we're in the middle of a local edit
  const isLocalEditRef = useRef(false);
  
  // Initialize from external text when it changes from external source
  useEffect(() => {
    // Skip if this change came from our own edit
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      return;
    }
    
    // Skip if text matches what we last synced
    if (text === lastSyncedRef.current) {
      return;
    }
    
    // Parse external text into sentences
    const parsed = parseStatement(text);
    
    let newS1 = "";
    let newS2 = "";
    let needsPeroidSync = false;
    
    if (parsed.sentences.length >= 1) {
      // Strip trailing period - we'll add it back when combining
      newS1 = stripTrailingPeriod(parsed.sentences[0].text);
    } else if (text.trim() && !text.includes(".")) {
      // No period found - put all text in S1 and flag that we need to sync the period back
      newS1 = text.trim();
      needsPeroidSync = true;
    }
    
    if (parsed.sentences.length >= 2) {
      // Strip trailing period from S2 as well
      newS2 = stripTrailingPeriod(parsed.sentences[1].text);
    }
    
    setSentence1(newS1);
    setSentence2(newS2);
    
    // If text had no period, sync back with the locked period added
    if (needsPeroidSync && newS1) {
      const combined = combineSentences(newS1, newS2);
      lastSyncedRef.current = combined;
      isLocalEditRef.current = true;
      onChange(combined);
    } else {
      // Remember what we synced from
      lastSyncedRef.current = text;
    }
  }, [text, onChange]);
  
  // Combine sentences and sync back to parent
  const syncToParent = useCallback((s1: string, s2: string) => {
    // combineSentences handles adding the period to s1
    const combined = combineSentences(s1, s2);
    lastSyncedRef.current = combined;
    isLocalEditRef.current = true;
    onChange(combined);
  }, [onChange]);
  
  // Sanitize input without trimming (preserves spaces while typing)
  const sanitizeInput = (text: string): string => {
    if (!text) return "";
    // Remove control characters
    let result = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    // Normalize unicode chars
    result = result
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
      .replace(/\u2026/g, ".")
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ");
    // Normalize multiple periods to single
    result = result.replace(/\.{2,}/g, ".");
    return result;
  };

  // Handle sentence 1 change
  const handleS1Change = (value: string) => {
    // Sanitize without trimming, then remove ALL periods
    const sanitized = sanitizeInput(value);
    const cleaned = stripAllPeriods(sanitized);
    setSentence1(cleaned);
    syncToParent(cleaned, sentence2);
  };
  
  // Handle sentence 2 change
  const handleS2Change = (value: string) => {
    // Sanitize without trimming, then remove ALL periods
    const sanitized = sanitizeInput(value);
    const cleaned = stripAllPeriods(sanitized);
    setSentence2(cleaned);
    syncToParent(sentence1, cleaned);
  };
  
  // Calculate character counts
  // Both sentences get a period added when combining
  const s1Trimmed = sentence1.trim();
  const s2Trimmed = sentence2.trim();
  // S1 always gets a period added when combining
  const s1Length = s1Trimmed ? s1Trimmed.length + 1 : 0; // +1 for locked period
  // S2 also gets a period added when combining (now consistent with S1)
  const s2Length = s2Trimmed ? s2Trimmed.length + 1 : 0; // +1 for locked period
  const spaceChar = (s1Trimmed && s2Trimmed) ? 1 : 0;
  const totalLength = s1Length + s2Length + spaceChar;
  const isOverLimit = totalLength > maxChars;
  
  // Suggested char allocation
  const suggestedPerSentence = Math.floor(maxChars / 2);
  
  // Check if we're a valid drop target (different MPA is dragging)
  const isValidDropTarget = draggedSentence && mpaKey && draggedSentence.sourceMpa !== mpaKey;
  
  // Drag handlers for initiating drag from this split view
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!mpaKey || disabled) return;
    
    const sentenceText = index === 0 ? s1Trimmed : s2Trimmed;
    if (!sentenceText) return;
    
    // Create a ParsedSentence-compatible object
    const sentence: ParsedSentence = {
      text: sentenceText + ".", // Add period for consistency with unified view
      index,
      startPos: 0,
      endPos: sentenceText.length + 1,
    };
    
    setIsDraggingFrom(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify({
      sentence,
      sourceMpa: mpaKey,
      sourceIndex: index,
    }));
    
    onDragStart?.({
      sentence,
      sourceMpa: mpaKey,
      sourceIndex: index,
    });
  };
  
  const handleDragEnd = () => {
    setIsDraggingFrom(null);
    setDragOverIndex(null);
    onDragEnd?.();
  };
  
  // Drop handlers for receiving drops
  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!isValidDropTarget) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };
  
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json")) as DraggedSentence;
      if (data.sourceMpa !== mpaKey) {
        onDrop?.(data, targetIndex);
      }
    } catch (err) {
      console.error("Failed to parse drag data:", err);
    }
  };
  
  return (
    <div className="space-y-2 overflow-hidden">
      {/* Sentence 1 - slides up like elevator door opening/closing */}
      <div 
        className={cn(
          "space-y-1 rounded-lg p-2 -m-2 transition-all",
          isClosing ? "animate-elevator-close-up" : "animate-elevator-up",
          isValidDropTarget && dragOverIndex === 0 && "bg-primary/10 ring-2 ring-primary ring-dashed",
          isValidDropTarget && dragOverIndex !== 0 && "bg-muted/30"
        )}
        onDragOver={(e) => handleDragOver(e, 0)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 0)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
          
            {/* Drop indicator */}
            {isValidDropTarget && dragOverIndex === 0 && (
              <span className="text-[10px] text-primary font-medium animate-pulse">
                Drop here
              </span>
            )}
          </div>
    
        </div>
        <div className="flex items-center gap-2">
          {/* Drag handle - left of textarea, centered vertically */}
          {mpaKey && s1Trimmed && !disabled && (
            <div
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 0)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center justify-center py-1 rounded-sm cursor-grab active:cursor-grabbing transition-all select-none shrink-0",
                "btn btn-ghost hover:bg-primary/10 border border-transparent hover:border-primary/30",
                "text-muted-foreground hover:text-primary",
                isDraggingFrom === 0 && "opacity-50 bg-primary/10 border-primary/30 text-primary"
              )}
              title="Drag to swap with another MPA"
            >
              <GripVertical className="size-5" />
            </div>
          )}
          <div className="relative flex-1">
            <textarea
              value={sentence1}
              onChange={(e) => handleS1Change(e.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              rows={2}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent pl-3 pr-6 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                s1Length > suggestedPerSentence && "border-amber-400/50",
                isValidDropTarget && dragOverIndex === 0 && "border-primary"
              )}
            />
            {/* Locked period indicator - bottom right */}
            {sentence1.trim() && (
              <span className="absolute right-2.5 bottom-2 text-sm font-medium text-foreground pointer-events-none select-none">
                .
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Divider - expands/collapses from center */}
      <div className={cn(
        "flex items-center gap-2 w-full justify-center mb-0",
        isClosing ? "animate-elevator-divider-close" : "animate-elevator-divider"
      )}>
        <span className="text-[15px] text-muted-foreground">+</span>
      </div>
      
      {/* Sentence 2 - slides down like elevator door opening/closing */}
      <div 
        className={cn(
          "space-y-1 rounded-lg p-2 -m-2 transition-all",
          isClosing ? "animate-elevator-close-down" : "animate-elevator-down",
          isValidDropTarget && dragOverIndex === 1 && "bg-primary/10 ring-2 ring-primary ring-dashed",
          isValidDropTarget && dragOverIndex !== 1 && "bg-muted/30"
        )}
        onDragOver={(e) => handleDragOver(e, 1)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 1)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
           
            {/* Drop indicator */}
            {isValidDropTarget && dragOverIndex === 1 && (
              <span className="text-[10px] text-primary font-medium animate-pulse">
                Drop here
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Drag handle - left of textarea, centered vertically */}
          {mpaKey && s2Trimmed && !disabled && (
            <div
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 1)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center justify-center py-1 rounded-sm cursor-grab active:cursor-grabbing transition-all select-none shrink-0",
                "btn btn-ghost hover:bg-primary/10 border border-transparent hover:border-primary/30",
                "text-muted-foreground hover:text-primary",
                isDraggingFrom === 1 && "opacity-50 bg-primary/10 border-primary/30 text-primary"
              )}
              title="Drag to swap with another MPA"
            >
              <GripVertical className="size-5" />
            </div>
          )}
          <div className="relative flex-1">
            <textarea
              value={sentence2}
              onChange={(e) => handleS2Change(e.target.value)}
              disabled={disabled}
              placeholder="Second sentence (optional)..."
              rows={2}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent pl-3 pr-6 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                s2Length > suggestedPerSentence && "border-amber-400/50",
                isValidDropTarget && dragOverIndex === 1 && "border-primary"
              )}
            />
            {/* Locked period indicator - bottom right (same as S1) */}
            {sentence2.trim() && (
              <span className="absolute right-2.5 bottom-2 text-sm font-medium text-foreground pointer-events-none select-none">
                .
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Combined total */}
      <div className="flex items-center justify-between pt-1">
        
        <span className={cn(
          "text-xs tabular-nums font-medium",
          getCharacterCountColor(totalLength, maxChars)
        )}>
          {totalLength}/{maxChars}
        </span>
      </div>
      
      {isOverLimit && (
        <p className="text-xs text-destructive">
          Combined statement exceeds the {maxChars} character limit by {totalLength - maxChars} characters.
        </p>
      )}
    </div>
  );
}
