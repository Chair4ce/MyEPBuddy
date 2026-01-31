"use client";

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
  onCommentUpdate?: (id: string, commentText: string, suggestion?: string) => void;
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
  const pendingCount = comments.filter((c) => c.status === "pending" || !c.status).length;
  const acceptedCount = comments.filter((c) => c.status === "accepted").length;
  const dismissedCount = comments.filter((c) => c.status === "dismissed").length;

  return (
    <div className="h-full flex flex-col bg-muted/30 border-l">
      {/* Header */}
      <div className="shrink-0 p-4 border-b bg-background">
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

      {/* Comments list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyMessage}
            </p>
          ) : (
            comments.map((comment) => (
              <CommentCard
                key={comment.id}
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
            ))
          )}
        </div>
      </ScrollArea>

      {/* Add general comment button (for mentor mode) */}
      {isEditable && onAddGeneralComment && (
        <div className="shrink-0 p-4 border-t bg-background">
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
