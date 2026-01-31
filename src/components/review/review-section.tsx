"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { cn, normalizeText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, MessageCircle, ArrowRightLeft, Trash2, FileEdit } from "lucide-react";
import type { CommentData, SuggestionType } from "./comment-card";

interface ReviewSectionProps {
  sectionKey: string;
  sectionLabel: string;
  content: string;
  comments?: CommentData[];
  activeCommentId?: string | null;
  hoveredCommentId?: string | null;
  isEditable?: boolean;
  hasRewrite?: boolean;
  onAddComment?: (comment: Omit<CommentData, "id">) => void;
  onCommentClick?: (id: string) => void;
  onCommentHover?: (id: string | null) => void;
  onSuggestRewrite?: () => void;
}

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  top: number;
  left: number;
}

export function ReviewSection({
  sectionKey,
  sectionLabel,
  content,
  comments = [],
  activeCommentId,
  hoveredCommentId,
  isEditable = false,
  hasRewrite = false,
  onAddComment,
  onCommentClick,
  onCommentHover,
  onSuggestRewrite,
}: ReviewSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [suggestionType, setSuggestionType] = useState<SuggestionType>("comment");
  const [replacementText, setReplacementText] = useState("");

  // Normalize content to fix PDF copy/paste line breaks
  const normalizedContent = normalizeText(content);

  // Get highlights for this section
  const sectionComments = comments.filter((c) => c.sectionKey === sectionKey);

  // Close popover helper
  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
    setSelection(null);
    setNewCommentText("");
    setSuggestionType("comment");
    setReplacementText("");
  }, []);

  // Check and process selection - called on various events
  const checkSelection = useCallback(() => {
    if (!isEditable || !contentRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText || selectedText.length < 2) {
      return;
    }

    const range = sel.getRangeAt(0);
    
    // Check if selection is within our content area
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    // Get the full text content of the container
    const fullText = contentRef.current.textContent || "";
    
    // Find the position of selected text
    let start = fullText.indexOf(selectedText);
    if (start === -1) {
      start = 0;
    }
    const end = start + selectedText.length;

    // Get position for popup - use the selection rect
    const rect = range.getBoundingClientRect();
    
    // Calculate position that stays within viewport
    let top = rect.top;
    let left = rect.left;
    
    // If popup would go above viewport, position it below the selection instead
    const popupHeight = 220;
    if (top - popupHeight < 10) {
      top = rect.bottom + 10; // Position below
    } else {
      top = top - 10; // Position above
    }
    
    // Ensure left doesn't overflow
    const popupWidth = 320;
    if (left + popupWidth > window.innerWidth - 10) {
      left = window.innerWidth - popupWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    setSelection({ text: selectedText, start, end, top, left });
    setIsPopoverOpen(true);
  }, [isEditable]);

  // Track if we started selection in this section
  const isSelectingInThisSectionRef = useRef(false);

  // Handle mouse down - mark that selection started in this section
  const handleMouseDown = useCallback(() => {
    if (!isEditable) return;
    
    isSelectingInThisSectionRef.current = true;
    
    // Close existing popover when starting a new selection
    if (isPopoverOpen) {
      closePopover();
    }
  }, [isEditable, isPopoverOpen, closePopover]);

  // Listen for mouseup at document level to catch selections that end outside the div
  useEffect(() => {
    if (!isEditable) return;

    const handleDocumentMouseUp = (e: MouseEvent) => {
      // Only process if we started selection in this section
      if (!isSelectingInThisSectionRef.current) {
        return;
      }
      
      isSelectingInThisSectionRef.current = false;
      
      // Don't process if clicking inside the popover
      if (popoverRef.current?.contains(e.target as Node)) {
        return;
      }
      
      // Use setTimeout to let Safari finalize the selection
      setTimeout(() => {
        checkSelection();
      }, 100);
    };

    document.addEventListener("mouseup", handleDocumentMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [isEditable, checkSelection]);

  // Handle touch end for mobile Safari
  const handleTouchEnd = useCallback(() => {
    if (!isEditable) return;
    
    setTimeout(() => {
      checkSelection();
    }, 150);
  }, [isEditable, checkSelection]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        closePopover();
      }
    };

    // Small delay to avoid closing immediately
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPopoverOpen, closePopover]);

  // Handle adding a comment
  const handleAddComment = useCallback(() => {
    if (!selection || !onAddComment) return;
    
    // For "delete" and "replace" types, comment is optional. For regular comments, require comment text
    if (suggestionType === "comment" && !newCommentText.trim()) return;
    // For "replace" type, require replacement text
    if (suggestionType === "replace" && !replacementText.trim()) return;

    // Generate default comment if not provided for suggestion types
    let finalCommentText = newCommentText.trim();
    if (!finalCommentText) {
      if (suggestionType === "delete") {
        finalCommentText = "Suggested deletion";
      } else if (suggestionType === "replace") {
        finalCommentText = "Suggested replacement";
      }
    }

    onAddComment({
      sectionKey,
      sectionLabel,
      originalText: normalizedContent,
      highlightStart: selection.start,
      highlightEnd: selection.end,
      highlightedText: selection.text,
      commentText: finalCommentText,
      suggestionType,
      replacementText: suggestionType === "replace" ? replacementText.trim() : undefined,
    });

    setNewCommentText("");
    setReplacementText("");
    setSuggestionType("comment");
    setSelection(null);
    setIsPopoverOpen(false);
    window.getSelection()?.removeAllRanges();
  }, [selection, newCommentText, replacementText, suggestionType, onAddComment, sectionKey, sectionLabel, content]);

  // Render content with highlights
  const renderHighlightedContent = () => {
    if (sectionComments.length === 0) {
      return normalizedContent;
    }

    // Sort highlights by start position
    const highlights = sectionComments
      .filter((c) => c.highlightStart !== undefined && c.highlightEnd !== undefined)
      .sort((a, b) => (a.highlightStart || 0) - (b.highlightStart || 0));

    if (highlights.length === 0) {
      return normalizedContent;
    }

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    highlights.forEach((highlight, idx) => {
      const start = highlight.highlightStart || 0;
      const end = highlight.highlightEnd || 0;

      // Add text before this highlight
      if (start > lastEnd) {
        parts.push(
          <span key={`text-${idx}`}>{normalizedContent.slice(lastEnd, start)}</span>
        );
      }

      // Add highlighted text
      const isActive = activeCommentId === highlight.id;
      const isHovered = hoveredCommentId === highlight.id;
      parts.push(
        <mark
          key={`highlight-${idx}`}
          className={cn(
            "cursor-pointer rounded px-0.5 transition-all",
            highlight.status === "dismissed" && "bg-muted/50 line-through",
            highlight.suggestionType === "delete" && "bg-destructive/20 text-destructive line-through",
            highlight.suggestionType !== "delete" && (!highlight.status || highlight.status === "pending" || highlight.status === "accepted") && "bg-primary text-primary-foreground",
            (isActive || isHovered) && "ring-1 ring-primary"
          )}
          onClick={() => onCommentClick?.(highlight.id)}
          onMouseEnter={() => onCommentHover?.(highlight.id)}
          onMouseLeave={() => onCommentHover?.(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onCommentClick?.(highlight.id)}
          aria-label={`View comment for: ${highlight.highlightedText}`}
        >
          {normalizedContent.slice(start, end)}
        </mark>
      );

      lastEnd = end;
    });

    // Add remaining text
    if (lastEnd < normalizedContent.length) {
      parts.push(<span key="text-end">{normalizedContent.slice(lastEnd)}</span>);
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
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm text-muted-foreground">
          {sectionLabel}
        </h4>
        {isEditable && onSuggestRewrite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSuggestRewrite}
            className={cn(
              "h-7 text-xs gap-1.5",
              hasRewrite && "text-primary"
            )}
          >
            <FileEdit className="size-3" />
            {hasRewrite ? "Edit Rewrite" : "Suggest Rewrite"}
          </Button>
        )}
      </div>
      
      {/* Content area */}
      <div
        ref={contentRef}
        className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          isEditable && "cursor-text select-text"
        )}
        onMouseDown={handleMouseDown}
        onTouchEnd={handleTouchEnd}
      >
        {renderHighlightedContent()}
      </div>

      {/* Popover for adding comments - positioned based on selection */}
      {isEditable && selection && isPopoverOpen && (
        <div 
          ref={popoverRef}
          className="fixed z-50 w-96 p-3 bg-popover border rounded-lg shadow-lg"
          style={{
            top: selection.top < 320 ? selection.top : selection.top - 320,
            left: selection.left,
          }}
        >
          <div className="space-y-3">
            {/* Selected text display */}
            <div className="flex items-start gap-2">
              <MessageSquarePlus className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Selected text:</p>
                <p className="text-xs italic bg-muted px-2 py-1 rounded line-clamp-2">
                  &ldquo;{selection.text}&rdquo;
                </p>
              </div>
            </div>

            {/* Suggestion type toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setSuggestionType("comment")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors",
                  suggestionType === "comment"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageCircle className="size-3" />
                Comment
              </button>
              <button
                type="button"
                onClick={() => setSuggestionType("replace")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors",
                  suggestionType === "replace"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowRightLeft className="size-3" />
                Replace
              </button>
              <button
                type="button"
                onClick={() => setSuggestionType("delete")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors",
                  suggestionType === "delete"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Trash2 className="size-3" />
                Delete
              </button>
            </div>

            {/* Replacement text input (only for replace type) */}
            {suggestionType === "replace" && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Replace with:</p>
                <Textarea
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="Enter replacement text..."
                  className="min-h-[60px] text-sm resize-none"
                  autoFocus
                  aria-label="Replacement text"
                />
              </div>
            )}

            {/* Comment text input */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {suggestionType === "comment" ? "Comment:" : "Reason (optional):"}
              </p>
              <Textarea
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={
                  suggestionType === "delete"
                    ? "Why should this be removed?"
                    : suggestionType === "replace"
                    ? "Why this replacement?"
                    : "Add your feedback..."
                }
                className="min-h-[60px] text-sm resize-none"
                autoFocus={suggestionType !== "replace"}
                aria-label="Comment"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  closePopover();
                  window.getSelection()?.removeAllRanges();
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={
                  (suggestionType === "comment" && !newCommentText.trim()) ||
                  (suggestionType === "replace" && !replacementText.trim())
                }
              >
                {suggestionType === "delete" ? "Suggest Deletion" : 
                 suggestionType === "replace" ? "Suggest Replace" : 
                 "Add Comment"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
