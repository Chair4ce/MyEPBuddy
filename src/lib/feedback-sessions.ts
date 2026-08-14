export type FeedbackShellType = "epb" | "award" | "decoration";

export interface FeedbackSessionSummary {
  id: string;
  reviewer_name: string;
  reviewer_name_source: string;
  comment_count: number;
  submitted_at: string;
  pending_count: number;
  accepted_count: number;
  dismissed_count: number;
  link_label?: string;
  is_anonymous?: boolean;
}

const sessionsCache = new Map<string, Promise<FeedbackSessionSummary[]>>();

function cacheKey(
  shellType: FeedbackShellType,
  shellId: string,
  bust: number
): string {
  return `${shellType}:${shellId}:${bust}`;
}

export function invalidateFeedbackSessionsCache(
  shellType?: FeedbackShellType,
  shellId?: string
): void {
  if (!shellType || !shellId) {
    sessionsCache.clear();
    return;
  }
  const prefix = `${shellType}:${shellId}:`;
  for (const key of sessionsCache.keys()) {
    if (key.startsWith(prefix)) sessionsCache.delete(key);
  }
}

export function loadFeedbackSessions(
  shellType: FeedbackShellType,
  shellId: string,
  bust = 0
): Promise<FeedbackSessionSummary[]> {
  const key = cacheKey(shellType, shellId, bust);
  const cached = sessionsCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<FeedbackSessionSummary[]> => {
    const response = await fetch(
      `/api/feedback?shellType=${encodeURIComponent(shellType)}&shellId=${encodeURIComponent(shellId)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load feedback");
    }
    return (data.sessions || []) as FeedbackSessionSummary[];
  })();

  sessionsCache.set(key, promise);
  return promise;
}

export interface FeedbackComment {
  id: string;
  section_key: string;
  original_text?: string;
  highlight_start?: number;
  highlight_end?: number;
  highlighted_text?: string;
  comment_text: string;
  suggestion?: string;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  suggestion_type?: "comment" | "replace" | "delete";
  replacement_text?: string;
  is_full_rewrite?: boolean;
  rewrite_text?: string;
}

export interface FeedbackContentSnapshot {
  duty_description?: string;
  cycle_year?: string;
  sections?: Array<{
    mpa: string;
    statement_text: string;
  }>;
}

export interface FeedbackSessionDetail {
  comments: FeedbackComment[];
  contentSnapshot: FeedbackContentSnapshot | null;
  error?: string;
}

const detailCache = new Map<string, Promise<FeedbackSessionDetail>>();

function detailCacheKey(sessionId: string, bust: number): string {
  return `${sessionId}:${bust}`;
}

export function invalidateFeedbackSessionDetailCache(sessionId?: string): void {
  if (!sessionId) {
    detailCache.clear();
    return;
  }
  const prefix = `${sessionId}:`;
  for (const key of detailCache.keys()) {
    if (key.startsWith(prefix)) detailCache.delete(key);
  }
}

export function loadFeedbackSessionDetail(
  sessionId: string,
  bust = 0
): Promise<FeedbackSessionDetail> {
  const key = detailCacheKey(sessionId, bust);
  const cached = detailCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<FeedbackSessionDetail> => {
    try {
      const response = await fetch(
        `/api/feedback/${encodeURIComponent(sessionId)}`
      );
      const data = await response.json();
      if (!response.ok) {
        return {
          comments: [],
          contentSnapshot: null,
          error: data.error || "Failed to load comments",
        };
      }
      return {
        comments: (data.comments || []) as FeedbackComment[],
        contentSnapshot: (data.contentSnapshot ||
          null) as FeedbackContentSnapshot | null,
      };
    } catch {
      return {
        comments: [],
        contentSnapshot: null,
        error: "Failed to load comments",
      };
    }
  })();

  detailCache.set(key, promise);
  return promise;
}

export function resolveFeedbackViewerSessionId(
  preferredSessionId: string | null,
  sessions: FeedbackSessionSummary[]
): string | null {
  return preferredSessionId ?? sessions[0]?.id ?? null;
}
