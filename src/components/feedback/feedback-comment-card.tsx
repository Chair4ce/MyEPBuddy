"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeedbackComment } from "@/lib/feedback-sessions";
import { motionLinkHover, motionPressOnly } from "@/lib/motion/classes";
import {
  Loader2,
  Check,
  MessageSquare,
  ArrowRightLeft,
  Trash2,
  FileEdit,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function CollapsibleStatement({
  children,
  defaultOpen = true,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          motionPressOnly,
          motionLinkHover,
          "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        )}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
        <Eye className="size-3" />
        {isOpen ? "Hide statement" : "Show statement"}
      </button>
      {isOpen && children}
    </div>
  );
}

function renderTextWithHighlight(
  text: string,
  highlightStart?: number,
  highlightEnd?: number,
  suggestionType?: string
) {
  if (!text) {
    return (
      <span className="text-muted-foreground italic">No content available</span>
    );
  }

  if (highlightStart === undefined || highlightEnd === undefined) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const before = text.slice(0, highlightStart);
  const highlighted = text.slice(highlightStart, highlightEnd);
  const after = text.slice(highlightEnd);

  return (
    <span className="whitespace-pre-wrap">
      {before}
      <mark
        className={cn(
          "px-0.5 rounded",
          suggestionType === "delete"
            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            : "bg-amber-200 dark:bg-amber-900/50"
        )}
      >
        {highlighted}
      </mark>
      {after}
    </span>
  );
}

export function FeedbackCommentCard({
  comment,
  sectionText,
  currentText,
  isUpdating,
  onMarkRead,
  onIgnore,
  onApply,
}: {
  comment: FeedbackComment;
  sectionText: string;
  currentText: string;
  isUpdating: boolean;
  onMarkRead: () => void;
  onIgnore: () => void;
  onApply?: () => void | Promise<void>;
}) {
  const isActionable =
    comment.suggestion_type === "replace" ||
    comment.suggestion_type === "delete" ||
    comment.is_full_rewrite;
  const isPending = comment.status === "pending";
  const textHasChanged = currentText !== sectionText;

  return (
    <div className={cn("space-y-4", !isPending && "opacity-60")}>
      {!isPending && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3" />
          {comment.status === "accepted" ? "Reviewed" : "Ignored"}
        </div>
      )}

      {isPending && isActionable && textHasChanged && (
        <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <MessageSquare className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Text has been edited since review</p>
            <p className="text-blue-600 dark:text-blue-400">
              AI will attempt to apply this change intelligently. If the text
              cannot be found, you&apos;ll be notified.
            </p>
          </div>
        </div>
      )}

      {isActionable && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {comment.is_full_rewrite ? (
            <>
              <FileEdit className="size-3" /> Suggested rewrite
            </>
          ) : comment.suggestion_type === "delete" ? (
            <>
              <Trash2 className="size-3" /> Suggested deletion
            </>
          ) : (
            <>
              <ArrowRightLeft className="size-3" /> Suggested replacement
            </>
          )}
        </div>
      )}

      {comment.is_full_rewrite && comment.rewrite_text ? (
        <CollapsibleStatement defaultOpen={isPending}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Eye className="size-3" /> Original Statement
              </p>
              <div className="text-sm bg-muted/50 p-3 rounded-lg border max-h-60 overflow-auto whitespace-pre-wrap">
                {sectionText || comment.original_text || "No content"}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <FileEdit className="size-3" /> Suggested Rewrite
              </p>
              <div className="text-sm bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border max-h-60 overflow-auto whitespace-pre-wrap">
                {comment.rewrite_text}
              </div>
            </div>
          </div>
        </CollapsibleStatement>
      ) : (
        <CollapsibleStatement defaultOpen={isPending}>
          <div className="text-sm bg-muted/50 p-3 rounded-lg border max-h-48 overflow-auto">
            {renderTextWithHighlight(
              sectionText || comment.original_text || "",
              comment.highlight_start,
              comment.highlight_end,
              comment.suggestion_type
            )}
          </div>
        </CollapsibleStatement>
      )}

      {comment.suggestion_type === "replace" && comment.replacement_text && (
        <div className="flex items-start gap-2 pl-2">
          <ArrowRight className="size-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Replace with:
            </p>
            <div className="text-sm bg-blue-50 dark:bg-blue-950/30 p-2 rounded border">
              {comment.replacement_text}
            </div>
          </div>
        </div>
      )}

      {comment.comment_text && (
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Reviewer&apos;s Comment:
          </p>
          <p className="text-sm">{comment.comment_text}</p>
        </div>
      )}

      {isPending && (
        <div className="flex gap-2 pt-2">
          {isActionable ? (
            <>
              <Button
                size="sm"
                onClick={onApply || onMarkRead}
                disabled={isUpdating}
                className="gap-1"
              >
                {isUpdating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Accept
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onIgnore}
                disabled={isUpdating}
              >
                Ignore
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkRead}
              disabled={isUpdating}
              className="gap-1"
            >
              {isUpdating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Mark as Read
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
