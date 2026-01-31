"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileEdit, ArrowRight } from "lucide-react";

interface SectionRewriteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionKey: string;
  sectionLabel: string;
  originalText: string;
  existingRewrite?: string;
  onSave: (rewriteText: string) => void;
}

export function SectionRewriteEditor({
  open,
  onOpenChange,
  sectionKey,
  sectionLabel,
  originalText,
  existingRewrite,
  onSave,
}: SectionRewriteEditorProps) {
  const [rewriteText, setRewriteText] = useState(existingRewrite || "");

  const handleSave = () => {
    if (rewriteText.trim()) {
      onSave(rewriteText.trim());
      onOpenChange(false);
    }
  };

  const handleCopyOriginal = () => {
    setRewriteText(originalText);
  };

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setRewriteText(existingRewrite || "");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="size-5" />
            Suggest Rewrite: {sectionLabel}
          </DialogTitle>
          <DialogDescription>
            Write a complete rewrite of this section. The original text will remain 
            visible for reference, and the owner will see your suggestion side-by-side.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Original text (read-only) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Original</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyOriginal}
                className="text-xs"
              >
                Copy to Editor
                <ArrowRight className="size-3 ml-1" />
              </Button>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg border text-sm leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-auto">
              {originalText || <span className="text-muted-foreground italic">No content</span>}
            </div>
          </div>

          {/* Rewrite editor */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Your Suggested Rewrite
            </p>
            <Textarea
              value={rewriteText}
              onChange={(e) => setRewriteText(e.target.value)}
              placeholder="Write your suggested version of this section..."
              className="min-h-[200px] resize-none text-sm w-full"
              aria-label="Suggested rewrite"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!rewriteText.trim()}>
            Save Suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
