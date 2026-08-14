"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { parseStatement, type ParsedSentence } from "@/lib/sentence-utils";
import { motionPressable } from "@/lib/motion/classes";
import { ArrowLeftRight, GripVertical } from "lucide-react";

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
  /** Swap S1 and S2 inside this MPA (no AI resize). */
  onReorder?: () => void;
  draggedSentence?: DraggedSentence | null;
  disabled?: boolean;
}

export function SentenceOrderSwapButton({
  disabled,
  onClick,
  className,
}: {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Swap sentence order"
      title="Swap sentence 1 and sentence 2"
      className={cn(
        "inline-flex items-center justify-center rounded-md size-6 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none",
        motionPressable,
        className,
      )}
    >
      <ArrowLeftRight className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function SentencePills({
  statementText,
  mpaKey,
  onDragStart,
  onDragEnd,
  onDrop,
  onReorder,
  draggedSentence,
  disabled = false,
}: SentencePillsProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const parsed = parseStatement(statementText);

  // Check if we're a valid drop target (different MPA)
  const isValidDropTarget = draggedSentence && draggedSentence.sourceMpa !== mpaKey;
  const isIntraMpaDrag =
    !!draggedSentence && draggedSentence.sourceMpa === mpaKey;

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

      if (data.sourceMpa === mpaKey) {
        if (data.sourceIndex !== targetIndex) {
          onReorder?.();
        }
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
              key={`drop-zone-${mpaKey}-${index}`}
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

  const canReorder = parsed.hasTwoSentences && parsed.sentences.length >= 2;

  return (
    <div className="flex items-center gap-1">
      {parsed.sentences.map((sentence, index) => {
        const charCount = sentence.text.length;
        const isBeingDragged = draggedSentence?.sourceMpa === mpaKey && draggedSentence?.sourceIndex === index;
        const isIntraDropTarget =
          isIntraMpaDrag && draggedSentence?.sourceIndex !== index;
        const isHovering = dragOverIndex === index && isIntraDropTarget;
        
        return (
          <div
            key={`${mpaKey}-s${sentence.index}-${sentence.startPos}`}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, sentence, index)}
            onDragEnd={handleDragEnd}
            onDragOver={
              isIntraDropTarget
                ? (e) => handleDragOver(e, index)
                : undefined
            }
            onDragLeave={isIntraDropTarget ? handleDragLeave : undefined}
            onDrop={isIntraDropTarget ? (e) => handleDrop(e, index) : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "group flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium cursor-grab active:cursor-grabbing transition-all select-none",
              "border bg-background hover:bg-accent hover:border-primary/40",
              "relative z-10",
              isBeingDragged && "opacity-50 border-dashed border-primary/60",
              isHovering && "border-primary bg-primary/10",
            )}
            title={
              canReorder
                ? `Drag onto the other sentence to reorder, or onto another MPA to move. "${sentence.text.slice(0, 60)}..."`
                : `Drag to swap with another MPA. "${sentence.text.slice(0, 60)}..."`
            }
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
      {canReorder && onReorder && (
        <SentenceOrderSwapButton onClick={onReorder} />
      )}
    </div>
  );
}
