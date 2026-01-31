"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommentCard, type CommentData } from "./comment-card";
import { MessageSquarePlus } from "lucide-react";

interface CommentSidebarProps {
  comments: CommentData[];
  isEditable?: boolean;
  activeCommentId?: string | null;
  hoveredCommentId?: string | null;
  editingCommentId?: string | null;
  onCommentUpdate?: (id: string, updates: { commentText?: string; replacementText?: string; rewriteText?: string }) => void;
  onCommentDelete?: (id: string) => void;
  onCommentClick?: (id: string) => void;
  onCommentHover?: (id: string | null) => void;
  onCommentAccept?: (id: string) => void;
  onCommentDismiss?: (id: string) => void;
  onAddGeneralComment?: () => void;
  title?: string;
  emptyMessage?: string;
}

export function CommentSidebar({
  comments,
  isEditable = false,
  activeCommentId,
  hoveredCommentId,
  editingCommentId,
  onCommentUpdate,
  onCommentDelete,
  onCommentClick,
  onCommentHover,
  onCommentAccept,
  onCommentDismiss,
  onAddGeneralComment,
  title = "Comments",
  emptyMessage = "No comments yet. Select text to add a comment.",
}: CommentSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCommentsLengthRef = useRef(comments.length);
  const pendingCount = comments.filter((c) => c.status === "pending" || !c.status).length;
  const acceptedCount = comments.filter((c) => c.status === "accepted").length;
  const dismissedCount = comments.filter((c) => c.status === "dismissed").length;

  // Scroll to newly added comment (when comments length increases and we have an active comment)
  useEffect(() => {
    const wasCommentAdded = comments.length > prevCommentsLengthRef.current;
    prevCommentsLengthRef.current = comments.length;

    // Scroll if a new comment was added and we have an active/editing comment to scroll to
    const targetId = editingCommentId || (wasCommentAdded ? activeCommentId : null);
    
    if (targetId && scrollContainerRef.current) {
      // Small delay to ensure the DOM has updated
      const timeoutId = setTimeout(() => {
        const commentElement = scrollContainerRef.current?.querySelector(
          `[data-comment-id="${targetId}"]`
        );
        if (commentElement) {
          commentElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [comments.length, editingCommentId, activeCommentId]);

  // Calculate if we need the footer (for padding calculation)
  const hasFooter = isEditable && onAddGeneralComment;

  return (
    <div className="h-full relative bg-muted/30 border-l">
      {/* Header - fixed at top */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {title} ({comments.length})
          </h3>
          {!isEditable && comments.length > 0 && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {pendingCount > 0 && (
                <span>{pendingCount} pending</span>
              )}
              {acceptedCount > 0 && (
                <span>{acceptedCount} accepted</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comments list - scrollable middle section */}
      <div 
        className="absolute left-0 right-0 overflow-y-auto"
        style={{ 
          top: '57px', // Header height
          bottom: hasFooter ? '73px' : '0' // Footer height or 0
        }}
      >
        <div ref={scrollContainerRef} className="p-4 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyMessage}
            </p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} data-comment-id={comment.id}>
                <CommentCard
                  comment={comment}
                  isEditable={isEditable}
                  isActive={activeCommentId === comment.id}
                  isHovered={hoveredCommentId === comment.id}
                  startInEditMode={editingCommentId === comment.id}
                  onUpdate={onCommentUpdate}
                  onDelete={onCommentDelete}
                  onClick={onCommentClick ? () => onCommentClick(comment.id) : undefined}
                  onHover={onCommentHover}
                  onAccept={onCommentAccept}
                  onDismiss={onCommentDismiss}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add general comment button - fixed at bottom */}
      {hasFooter && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={onAddGeneralComment}
          >
            <MessageSquarePlus className="size-4" />
            Add General Comment
          </Button>
        </div>
      )}
    </div>
  );
}
