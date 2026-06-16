"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeftRight, Replace, Loader2, Sparkles } from "lucide-react";
import type { ParsedSentence } from "@/lib/sentence-utils";

export interface SentenceDropAction {
  type: "replace" | "swap";
  sourceMpa: string;
  sourceIndex: number;
  sourceSentence: ParsedSentence;
  targetMpa: string;
  targetIndex: number;
  targetSentence: ParsedSentence | null;
  sourceOtherSentence: ParsedSentence | null;
  targetOtherSentence: ParsedSentence | null;
}

interface SentenceDropDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceMpaLabel: string;
  targetMpaLabel: string;
  sourceSentence: ParsedSentence;
  targetSentence: ParsedSentence | null;
  sourceIndex: number;
  targetIndex: number;
  targetMaxChars: number;
  sourceMaxChars: number;
  isProcessing: boolean;
  onReplace: () => void;
  onSwap: () => void;
}

export function SentenceDropDialog({
  isOpen,
  onClose,
  sourceMpaLabel,
  targetMpaLabel,
  sourceSentence,
  targetSentence,
  sourceIndex,
  targetIndex,
  targetMaxChars,
  sourceMaxChars,
  isProcessing,
  onReplace,
  onSwap,
}: SentenceDropDialogProps) {
  const canSwap = !!targetSentence;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Move Sentence
          </DialogTitle>
          <DialogDescription className="text-left">
            Choose how to handle the sentence move
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source sentence preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-2 py-1 rounded bg-primary/10 text-primary">
                S{sourceIndex + 1}
              </span>
              <span className="text-sm text-muted-foreground">
                from <span className="font-medium text-foreground">{sourceMpaLabel}</span> ({sourceSentence.text.length} chars)
              </span>
            </div>
            <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md border">
              {sourceSentence.text}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowLeftRight className="size-5 text-primary" />
            </div>
          </div>

          {/* Target position preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-2 py-1 rounded bg-primary/10 text-primary">
                S{targetIndex + 1}
              </span>
              <span className="text-sm text-muted-foreground">
                in <span className="font-medium text-foreground">{targetMpaLabel}</span> {targetSentence ? `(${targetSentence.text.length} chars)` : "(empty)"}
              </span>
            </div>
            {targetSentence ? (
              <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md border">
                {targetSentence.text}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic bg-muted/50 p-3 rounded-md border border-dashed">
                No existing sentence at this position
              </p>
            )}
          </div>

          {/* AI resize notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              AI will automatically resize sentences to fit within the character limits 
              ({targetMaxChars} for {targetMpaLabel}{canSwap ? `, ${sourceMaxChars} for ${sourceMpaLabel}` : ""})
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          
          {canSwap && (
            <Button
              variant="outline"
              onClick={onSwap}
              disabled={isProcessing}
              className="w-full sm:w-auto gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="size-4" />
              )}
              Swap Sentences
            </Button>
          )}
          
          <Button
            onClick={onReplace}
            disabled={isProcessing}
            className="w-full sm:w-auto gap-1.5"
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Replace className="size-4" />
            )}
            {canSwap ? "Replace Only" : "Place Sentence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
