"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MessageSquarePlus } from "lucide-react";
import type { CommentData } from "./comment-card";

interface ReviewSectionProps {
  sectionKey: string;
  sectionLabel: string;
  content: string;
  comments?: CommentData[];
  activeCommentId?: string | null;
  isEditable?: boolean;
  onAddComment?: (comment: Omit<CommentData, "id">) => void;
  onCommentClick?: (id: string) => void;
}

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: DOMRect;
}

export function ReviewSection({
  sectionKey,
  sectionLabel,
  content,
  comments = [],
  activeCommentId,
  isEditable = false,
  onAddComment,
  onCommentClick,
}: ReviewSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");

  // Get highlights for this section
  const sectionComments = comments.filter((c) => c.sectionKey === sectionKey);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (!isEditable) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) {
      setSelection(null);
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) {
      setSelection(null);
      return;
    }

    // Check if selection is within our content area
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    // Calculate positions relative to the content
    const contentText = content;
    const start = contentText.indexOf(selectedText);
    const end = start + selectedText.length;

    if (start === -1) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({ text: selectedText, start, end, rect });
    setIsPopoverOpen(true);
  }, [isEditable, content]);

  // Handle adding a comment
  const handleAddComment = useCallback(() => {
    if (!selection || !newCommentText.trim() || !onAddComment) return;

    onAddComment({
      sectionKey,
      sectionLabel,
      originalText: content,
      highlightStart: selection.start,
      highlightEnd: selection.end,
      highlightedText: selection.text,
      commentText: newCommentText.trim(),
    });

    setNewCommentText("");
    setSelection(null);
    setIsPopoverOpen(false);
    window.getSelection()?.removeAllRanges();
  }, [selection, newCommentText, onAddComment, sectionKey, sectionLabel, content]);

  // Render content with highlights
  const renderHighlightedContent = () => {
    if (sectionComments.length === 0) {
      return content;
    }

    // Sort highlights by start position
    const highlights = sectionComments
      .filter((c) => c.highlightStart !== undefined && c.highlightEnd !== undefined)
      .sort((a, b) => (a.highlightStart || 0) - (b.highlightStart || 0));

    if (highlights.length === 0) {
      return content;
    }

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    highlights.forEach((highlight, idx) => {
      const start = highlight.highlightStart || 0;
      const end = highlight.highlightEnd || 0;

      // Add text before this highlight
      if (start > lastEnd) {
        parts.push(
          <span key={`text-${idx}`}>{content.slice(lastEnd, start)}</span>
        );
      }

      // Add highlighted text
      const isActive = activeCommentId === highlight.id;
      parts.push(
        <mark
          key={`highlight-${idx}`}
          className={cn(
            "cursor-pointer rounded px-0.5 transition-colors",
            highlight.status === "accepted" && "bg-green-200 dark:bg-green-900/50",
            highlight.status === "dismissed" && "bg-muted line-through",
            (!highlight.status || highlight.status === "pending") && "bg-amber-200 dark:bg-amber-900/50",
            isActive && "ring-2 ring-primary ring-offset-1"
          )}
          onClick={() => onCommentClick?.(highlight.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onCommentClick?.(highlight.id)}
          aria-label={`View comment for: ${highlight.highlightedText}`}
        >
          {content.slice(start, end)}
        </mark>
      );

      lastEnd = end;
    });

    // Add remaining text
    if (lastEnd < content.length) {
      parts.push(<span key="text-end">{content.slice(lastEnd)}</span>);
    }

    return parts;
  };

  if (!content) {
    return (
      <div className="p-4 rounded-lg border bg-card">
        <h4 className="font-medium text-sm mb-2">{sectionLabel}</h4>
        <p className="text-sm text-muted-foreground italic">No content</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border bg-card relative">
      <h4 className="font-medium text-sm mb-3 text-muted-foreground">
        {sectionLabel}
      </h4>
      
      <Popover open={isPopoverOpen && isEditable} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <div
            ref={contentRef}
            className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap",
              isEditable && "cursor-text select-text"
            )}
            onMouseUp={handleMouseUp}
          >
            {renderHighlightedContent()}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-3"
          side="top"
          align="start"
          sideOffset={5}
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <MessageSquarePlus className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Selected text:</p>
                <p className="text-xs italic bg-muted px-2 py-1 rounded line-clamp-2">
                  &ldquo;{selection?.text}&rdquo;
                </p>
              </div>
            </div>
            <Textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Add your comment..."
              className="min-h-[80px] text-sm resize-none"
              autoFocus
              aria-label="Add comment"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsPopoverOpen(false);
                  setSelection(null);
                  setNewCommentText("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={!newCommentText.trim()}
              >
                Add Comment
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Comment count indicator */}
      {sectionComments.length > 0 && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-medium">
            {sectionComments.length}
          </span>
        </div>
      )}
    </div>
  );
}
