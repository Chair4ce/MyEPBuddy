"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { X, Check, MessageSquare } from "lucide-react";

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
}

interface CommentCardProps {
  comment: CommentData;
  isEditable?: boolean;
  isActive?: boolean;
  onUpdate?: (id: string, commentText: string, suggestion?: string) => void;
  onDelete?: (id: string) => void;
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onClick?: () => void;
}

export function CommentCard({
  comment,
  isEditable = false,
  isActive = false,
  onUpdate,
  onDelete,
  onAccept,
  onDismiss,
  onClick,
}: CommentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.commentText);

  const handleSave = () => {
    if (editText.trim() && onUpdate) {
      onUpdate(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditText(comment.commentText);
    setIsEditing(false);
  };

  const statusColors = {
    pending: "border-l-amber-400",
    accepted: "border-l-green-500 bg-green-50 dark:bg-green-950/20",
    dismissed: "border-l-muted opacity-60",
  };

  return (
    <div
      className={cn(
        "relative p-3 rounded-lg border border-l-4 bg-card transition-all",
        statusColors[comment.status || "pending"],
        isActive && "ring-2 ring-primary ring-offset-2",
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={onClick}
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

      {/* Highlighted text quote */}
      {comment.highlightedText && (
        <div className="mb-2 pb-2 border-b">
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            &ldquo;{comment.highlightedText}&rdquo;
          </p>
        </div>
      )}

      {/* Section label */}
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="size-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {comment.sectionLabel}
        </span>
      </div>

      {/* Comment text */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[60px] text-sm resize-none"
            placeholder="Enter your feedback..."
            autoFocus
            aria-label="Edit comment"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editText.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "text-sm leading-relaxed",
            comment.status === "dismissed" && "line-through"
          )}
        >
          {comment.commentText}
        </p>
      )}

      {/* Suggestion if provided */}
      {comment.suggestion && !isEditing && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Suggested replacement:</p>
          <p className="text-sm italic bg-muted/50 px-2 py-1 rounded">
            {comment.suggestion}
          </p>
        </div>
      )}

      {/* Status indicator for resolved comments */}
      {comment.status && comment.status !== "pending" && (
        <div className="mt-2 pt-2 border-t">
          <span className={cn(
            "text-xs font-medium",
            comment.status === "accepted" && "text-green-600 dark:text-green-400",
            comment.status === "dismissed" && "text-muted-foreground"
          )}>
            {comment.status === "accepted" ? "✓ Accepted" : "Dismissed"}
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
              className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
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
            setIsEditing(true);
          }}
        >
          Edit
        </Button>
      )}
    </div>
  );
}
