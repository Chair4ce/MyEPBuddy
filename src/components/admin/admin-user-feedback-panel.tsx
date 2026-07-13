"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  type AdminUserFeedbackItem,
  type UserFeedbackStatus,
} from "@/lib/admin/user-feedback";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
} from "lucide-react";

type StatusFilter = UserFeedbackStatus | "all";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "replied", label: "Replied" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const MAX_REPLY_LENGTH = 5000;

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function truncate(text: string, max = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function AdminUserFeedbackPanel() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [items, setItems] = useState<AdminUserFeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function loadFeedback(nextFilter: StatusFilter = statusFilter) {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(
        `/api/admin/user-feedback?status=${encodeURIComponent(nextFilter)}&limit=50`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to load feedback",
        );
      }
      setItems((data.items ?? []) as AdminUserFeedbackItem[]);
      setHasLoaded(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load feedback";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterChange(next: StatusFilter) {
    setStatusFilter(next);
    setExpandedId(null);
    void loadFeedback(next);
  }

  function upsertItem(updated: AdminUserFeedbackItem) {
    setItems((prev) => {
      const matchesFilter =
        statusFilter === "all" || updated.status === statusFilter;
      if (!matchesFilter) {
        return prev.filter((item) => item.id !== updated.id);
      }
      const exists = prev.some((item) => item.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((item) => (item.id === updated.id ? updated : item));
    });
  }

  async function handleSendReply(item: AdminUserFeedbackItem) {
    const reply = (replyDrafts[item.id] ?? "").trim();
    if (!reply) {
      toast.error("Write a reply before sending");
      return;
    }

    setSendingId(item.id);
    try {
      const response = await fetch("/api/admin/user-feedback/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: item.id, reply }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send reply",
        );
      }

      const updated = data.item as AdminUserFeedbackItem;
      upsertItem(updated);
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast.success(`Reply emailed to ${updated.user_email ?? "user"}`);
      if (statusFilter === "open") {
        setExpandedId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSendingId(null);
    }
  }

  async function handleArchive(item: AdminUserFeedbackItem) {
    setArchivingId(item.id);
    try {
      const response = await fetch("/api/admin/user-feedback/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: item.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to archive",
        );
      }
      upsertItem(data.item as AdminUserFeedbackItem);
      toast.success("Feedback archived");
      if (expandedId === item.id) setExpandedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
          aria-label="Feedback status filter"
        >
          {FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            return (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={isActive}
                aria-label={`Show ${filter.label.toLowerCase()} feedback`}
                disabled={isLoading}
                onClick={() => handleFilterChange(filter.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 h-auto text-sm font-medium active:scale-[0.98] transition-transform duration-150",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </Button>
            );
          })}
        </nav>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadFeedback()}
          disabled={isLoading}
          aria-label="Refresh feedback list"
          className="active:scale-[0.98] transition-transform duration-150"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {!hasLoaded && !isLoading && (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <MessageSquare className="size-5 mx-auto mb-2 opacity-60" aria-hidden />
          Click Refresh to load user feedback.
        </div>
      )}

      {isLoading && !hasLoaded && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <span className="ml-2 text-sm">Loading feedback…</span>
        </div>
      )}

      {hasLoaded && loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {hasLoaded && !loadError && items.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No {statusFilter === "all" ? "" : `${statusFilter} `}feedback yet.
        </div>
      )}

      {hasLoaded && items.length > 0 && (
        <ul className="space-y-3" aria-label="User feedback list">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const draft = replyDrafts[item.id] ?? item.admin_reply ?? "";
            const isSending = sendingId === item.id;
            const isArchiving = archivingId === item.id;

            return (
              <li
                key={item.id}
                className="rounded-lg border bg-muted/30 p-4 space-y-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {item.feature}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="font-normal capitalize"
                      >
                        {item.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {item.user_name || item.user_email || "Unknown user"}
                      {item.user_name && item.user_email ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {item.user_email}
                        </span>
                      ) : null}
                    </p>
                    {!isExpanded && (
                      <p className="text-sm text-muted-foreground">
                        {truncate(item.feedback)}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-expanded={isExpanded}
                    aria-controls={`feedback-detail-${item.id}`}
                    aria-label={isExpanded ? "Collapse feedback" : "Expand feedback"}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    className="shrink-0 active:scale-[0.98] transition-transform duration-150"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden />
                    )}
                    <span className="ml-1">{isExpanded ? "Hide" : "Open"}</span>
                  </Button>
                </div>

                <div
                  id={`feedback-detail-${item.id}`}
                  className="t-collapse-grid"
                  data-open={isExpanded ? "true" : "false"}
                >
                  <div className="min-h-0">
                    <div className="space-y-3 pt-1">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Feedback
                        </p>
                        <pre className="whitespace-pre-wrap text-sm font-sans rounded-md border bg-background/60 p-3">
                          {item.feedback}
                        </pre>
                      </div>

                      {item.admin_reply && item.status !== "open" && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Previous reply
                            {item.email_sent_at
                              ? ` · emailed ${formatDate(item.email_sent_at)}`
                              : null}
                          </p>
                          <pre className="whitespace-pre-wrap text-sm font-sans rounded-md border bg-background/60 p-3">
                            {item.admin_reply}
                          </pre>
                        </div>
                      )}

                      {item.status !== "archived" && (
                        <div className="space-y-2">
                          <label
                            htmlFor={`reply-${item.id}`}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Your reply
                          </label>
                          <Textarea
                            id={`reply-${item.id}`}
                            aria-label={`Reply to feedback from ${item.user_email ?? "user"}`}
                            value={draft}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            rows={4}
                            maxLength={MAX_REPLY_LENGTH}
                            disabled={isSending || !isExpanded}
                            tabIndex={isExpanded ? 0 : -1}
                            className="resize-y min-h-[96px]"
                            placeholder="Write a helpful reply. This will be emailed from your app domain."
                          />
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                              {draft.length}/{MAX_REPLY_LENGTH}
                              {!item.user_email && (
                                <span className="text-destructive">
                                  {" "}
                                  · No email on file
                                </span>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {item.status === "open" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleArchive(item)}
                                  disabled={isArchiving || isSending || !isExpanded}
                                  aria-label="Archive without emailing"
                                  className="active:scale-[0.98] transition-transform duration-150"
                                >
                                  {isArchiving ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                  ) : (
                                    <Archive className="size-4" aria-hidden />
                                  )}
                                  <span className="ml-2">Archive</span>
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleSendReply(item)}
                                disabled={
                                  !isExpanded ||
                                  isSending ||
                                  isArchiving ||
                                  !draft.trim() ||
                                  !item.user_email
                                }
                                aria-label="Send reply email"
                                className="active:scale-[0.98] transition-transform duration-150"
                              >
                                {isSending ? (
                                  <Loader2 className="size-4 animate-spin" aria-hidden />
                                ) : (
                                  <Send className="size-4" aria-hidden />
                                )}
                                <span className="ml-2">
                                  {isSending ? "Sending…" : "Send reply"}
                                </span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {item.status === "archived" && (
                        <p className="text-xs text-muted-foreground">
                          Archived. Expand Open items to reply to new feedback.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
