"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { parseStatement, type ParsedSentence } from "@/lib/sentence-utils";
import { GripVertical } from "lucide-react";

export interface DraggedSentence {
  sentence: ParsedSentence;
  sourceMpa: string;
  sourceIndex: number; // 0 or 1
}

interface SentencePillsProps {
  statementText: string;
  mpaKey: string;
  mpaLabel: string;
  maxChars: number;
  onDragStart?: (data: DraggedSentence) => void;
  onDragEnd?: () => void;
  onDrop?: (data: DraggedSentence, targetIndex: number) => void;
  draggedSentence?: DraggedSentence | null;
  disabled?: boolean;
}

export function SentencePills({
  statementText,
  mpaKey,
  onDragStart,
  onDragEnd,
  onDrop,
  draggedSentence,
  disabled = false,
}: SentencePillsProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const parsed = parseStatement(statementText);

  // Check if we're a valid drop target (different MPA)
  const isValidDropTarget = draggedSentence && draggedSentence.sourceMpa !== mpaKey;

  // Don't render if disabled
  if (disabled) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent, sentence: ParsedSentence, index: number) => {
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
    setDragOverIndex(null);
    onDragEnd?.();
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
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
      
      // Don't allow dropping on same MPA
      if (data.sourceMpa === mpaKey) {
        return;
      }
      
      onDrop?.(data, targetIndex);
    } catch (err) {
      console.error("Failed to parse drag data:", err);
    }
  };

  // Show drop zones when dragging from another MPA
  const showDropZones = isValidDropTarget;

  // If showing drop zones, render drop zone UI
  if (showDropZones) {
    return (
      <div className="flex items-center gap-1">
        {[0, 1].map((index) => {
          const isHovering = dragOverIndex === index;
          const existingSentence = parsed.sentences[index];
          
          return (
            <div
              key={index}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={cn(
                "flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                "border-2 border-dashed cursor-pointer",
                isHovering 
                  ? "border-primary bg-primary/10 scale-105" 
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              <span className={cn(
                "font-bold",
                index === 0 ? "text-primary" : "text-primary"
              )}>
                S{index + 1}
              </span>
              {existingSentence ? (
                <span className="text-muted-foreground">
                  ({existingSentence.text.length})
                </span>
              ) : (
                <span className="text-muted-foreground italic">
                  ∅
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Normal view - show draggable pills
  if (parsed.sentences.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {parsed.sentences.map((sentence, index) => {
        const charCount = sentence.text.length;
        const isBeingDragged = draggedSentence?.sourceMpa === mpaKey && draggedSentence?.sourceIndex === index;
        
        return (
          <div
            key={index}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, sentence, index)}
            onDragEnd={handleDragEnd}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "group flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium cursor-grab active:cursor-grabbing transition-all select-none",
              "border bg-background hover:bg-accent hover:border-primary/40",
              "relative z-10",
              isBeingDragged && "opacity-50 border-dashed border-primary/60",
            )}
            title={`Drag to swap with another MPA. "${sentence.text.slice(0, 60)}..."`}
          >
            <GripVertical className="size-2.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-primary">
              S{index + 1}
            </span>
            <span className="text-muted-foreground">
              ({charCount})
            </span>
          </div>
        );
      })}
    </div>
  );
}
