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
