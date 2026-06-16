"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { X, Check, MessageSquare, ArrowRightLeft, Trash2, FileEdit } from "lucide-react";

export type SuggestionType = "comment" | "replace" | "delete";

export interface CommentData {
  id: string;
  sectionKey: string;
  sectionLabel: string;
  originalText?: string;
  highlightStart?: number;
  highlightEnd?: number;
  highlightedText?: string;
  commentText: string;
  suggestion?: string;
  status?: "pending" | "accepted" | "dismissed";
  // New fields for suggestion system
  suggestionType?: SuggestionType;
  replacementText?: string;
  // Full section rewrite
  isFullRewrite?: boolean;
  rewriteText?: string;
}

interface CommentCardProps {
  comment: CommentData;
  isEditable?: boolean;
  isActive?: boolean;
  isHovered?: boolean;
  startInEditMode?: boolean;
  onUpdate?: (id: string, updates: { commentText?: string; replacementText?: string; rewriteText?: string }) => void;
  onDelete?: (id: string) => void;
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onClick?: () => void;
  onHover?: (id: string | null) => void;
}

export function CommentCard({
  comment,
  isEditable = false,
  isActive = false,
  isHovered = false,
  startInEditMode = false,
  onUpdate,
  onDelete,
  onAccept,
  onDismiss,
  onClick,
  onHover,
}: CommentCardProps) {
  const [isEditing, setIsEditing] = useState(startInEditMode);
  
  // Determine what text to edit based on suggestion type
  const getEditableText = () => {
    if (comment.isFullRewrite && comment.rewriteText) {
      return comment.rewriteText;
    }
    return comment.commentText;
  };
  
  const [editText, setEditText] = useState(getEditableText());
  // Separate state for replacement text editing
  const [editReplacementText, setEditReplacementText] = useState(comment.replacementText || "");
  // Separate state for reason (commentText) when editing replace type
  const [editReasonText, setEditReasonText] = useState(comment.commentText || "");
  
  // Determine what we're editing for the label
  const getEditLabel = () => {
    if (comment.isFullRewrite) {
      return "rewrite";
    }
    return "comment";
  };

  const handleSave = () => {
    if (onUpdate) {
      // Update the appropriate field based on suggestion type
      if (comment.suggestionType === "replace") {
        // For replace type, update both replacement text and reason
        if (editReplacementText.trim()) {
          onUpdate(comment.id, { 
            replacementText: editReplacementText.trim(),
            commentText: editReasonText.trim() || undefined
          });
        }
      } else if (comment.isFullRewrite) {
        if (editText.trim()) {
          onUpdate(comment.id, { rewriteText: editText.trim() });
        }
      } else {
        if (editText.trim()) {
          onUpdate(comment.id, { commentText: editText.trim() });
        }
      }
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditText(getEditableText());
    setEditReplacementText(comment.replacementText || "");
    setEditReasonText(comment.commentText || "");
    setIsEditing(false);
  };
  
  // Start editing - reset editText to current value
  const handleStartEdit = () => {
    setEditText(getEditableText());
    setEditReplacementText(comment.replacementText || "");
    setEditReasonText(comment.commentText || "");
    setIsEditing(true);
  };

  return (
    <div
      className={cn(
        "relative p-3 rounded-lg bg-card transition-all",
        comment.status === "dismissed" && "opacity-60",
        (isActive || isHovered) && "ring-1 ring-primary bg-primary/5",
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={onClick}
      onMouseEnter={() => onHover?.(comment.id)}
      onMouseLeave={() => onHover?.(null)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {/* Delete button for editable comments */}
      {isEditable && onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-2 -right-2 size-6 rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(comment.id);
          }}
          aria-label="Delete comment"
        >
          <X className="size-3" />
        </Button>
      )}

      {/* Section label and suggestion type badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {comment.isFullRewrite ? (
            <FileEdit className="size-3 text-muted-foreground" />
          ) : comment.suggestionType === "replace" ? (
            <ArrowRightLeft className="size-3 text-muted-foreground" />
          ) : comment.suggestionType === "delete" ? (
            <Trash2 className="size-3 text-muted-foreground" />
          ) : (
            <MessageSquare className="size-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {comment.sectionLabel}
          </span>
        </div>
        {/* Suggestion type badge */}
        {(comment.suggestionType === "replace" || comment.suggestionType === "delete" || comment.isFullRewrite) && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            comment.suggestionType === "delete" && "bg-destructive/10 text-destructive",
            comment.suggestionType === "replace" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            comment.isFullRewrite && "bg-purple-500/10 text-purple-600 dark:text-purple-400"
          )}>
            {comment.isFullRewrite ? "Rewrite" : comment.suggestionType === "delete" ? "Delete" : "Replace"}
          </span>
        )}
      </div>

      {/* Highlighted text quote (for non-rewrite comments) */}
      {comment.highlightedText && !comment.isFullRewrite && (
        <div className="mb-2 pb-2 border-b">
          <p className={cn(
            "text-xs italic max-h-20 overflow-auto",
            comment.suggestionType === "delete" 
              ? "text-destructive line-through" 
              : "text-muted-foreground"
          )}>
            &ldquo;{comment.highlightedText}&rdquo;
          </p>
        </div>
      )}

      {/* Comment text / Edit mode */}
      {isEditing ? (
        <div className="space-y-3">
          {comment.suggestionType === "replace" ? (
            <>
              {/* Replace with input */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Replace with
                </label>
                <Textarea
                  value={editReplacementText}
                  onChange={(e) => setEditReplacementText(e.target.value)}
                  className="min-h-[60px] text-sm resize-none"
                  placeholder="Enter replacement text..."
                  autoFocus
                  aria-label="Replace with"
                />
              </div>
              {/* Reason input */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Reason <span className="font-normal">(optional)</span>
                </label>
                <Textarea
                  value={editReasonText}
                  onChange={(e) => setEditReasonText(e.target.value)}
                  className="min-h-[40px] text-sm resize-none"
                  placeholder="Why this replacement is suggested..."
                  aria-label="Reason for replacement"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Edit {getEditLabel()}
              </label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
                placeholder={
                  comment.isFullRewrite 
                    ? "Enter rewritten text..." 
                    : "Enter your feedback..."
                }
                autoFocus
                aria-label={`Edit ${getEditLabel()}`}
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={comment.suggestionType === "replace" ? !editReplacementText.trim() : !editText.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        // For replace type, don't show commentText here - it's shown at the bottom as reason
        comment.suggestionType !== "replace" && (
          <p
            className={cn(
              "text-sm leading-relaxed",
              comment.status === "dismissed" && "line-through"
            )}
          >
            {comment.commentText}
          </p>
        )
      )}

      {/* Replacement text (for replace type) - shown as main content */}
      {comment.suggestionType === "replace" && comment.replacementText && !isEditing && (
        <p className="text-sm bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-1.5 rounded">
          {comment.replacementText}
        </p>
      )}
      
      {/* Reason for replacement (optional) - shown at bottom */}
      {comment.suggestionType === "replace" && comment.commentText && !isEditing && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Reason</p>
          <p className="text-sm text-muted-foreground italic">
            {comment.commentText}
          </p>
        </div>
      )}

      {/* Full rewrite preview */}
      {comment.isFullRewrite && comment.rewriteText && !isEditing && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Suggested rewrite:</p>
          <p className="text-sm bg-purple-500/10 text-purple-700 dark:text-purple-300 px-2 py-1.5 rounded max-h-24 overflow-auto">
            {comment.rewriteText}
          </p>
        </div>
      )}

      {/* Legacy suggestion if provided - display without "Suggested replacement" label */}
      {comment.suggestion && !comment.replacementText && !comment.rewriteText && !isEditing && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-sm italic bg-muted/50 px-2 py-1 rounded">
            {comment.suggestion}
          </p>
        </div>
      )}

      {/* Status indicator for resolved comments */}
      {comment.status && comment.status !== "pending" && (
        <div className="mt-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {comment.status === "accepted" ? "Accepted" : "Dismissed"}
          </span>
        </div>
      )}

      {/* Action buttons for pending comments in viewer mode */}
      {!isEditable && comment.status === "pending" && (onAccept || onDismiss) && (
        <div className="mt-2 pt-2 border-t flex gap-2">
          {onAccept && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onAccept(comment.id);
              }}
            >
              <Check className="size-3 mr-1" />
              Accept
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(comment.id);
              }}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}

      {/* Edit button for editable mode */}
      {isEditable && !isEditing && onUpdate && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleStartEdit();
          }}
        >
          Edit
        </Button>
      )}
    </div>
  );
}
