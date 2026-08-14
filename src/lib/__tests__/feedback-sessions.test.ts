import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateFeedbackSessionDetailCache,
  invalidateFeedbackSessionsCache,
  loadFeedbackSessionDetail,
  loadFeedbackSessions,
  resolveFeedbackViewerSessionId,
} from "../feedback-sessions";

afterEach(() => {
  invalidateFeedbackSessionDetailCache();
  invalidateFeedbackSessionsCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveFeedbackViewerSessionId", () => {
  const sessions = [
    { id: "s1", reviewer_name: "Alex" },
    { id: "s2", reviewer_name: "Jordan" },
  ] as never;

  it("prefers the selected session id", () => {
    expect(resolveFeedbackViewerSessionId("s2", sessions)).toBe("s2");
  });

  it("falls back to the first session when none is selected", () => {
    expect(resolveFeedbackViewerSessionId(null, sessions)).toBe("s1");
  });

  it("returns null when there is nothing to show", () => {
    expect(resolveFeedbackViewerSessionId(null, [])).toBeNull();
  });
});

describe("loadFeedbackSessionDetail", () => {
  it("fetches comments for the session and caches the promise", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        comments: [
          {
            id: "c1",
            section_key: "executing_mission",
            comment_text: "Tighten the verb",
            status: "pending",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        contentSnapshot: { duty_description: "NCOIC" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = loadFeedbackSessionDetail("session-1", 0);
    const second = loadFeedbackSessionDetail("session-1", 0);
    expect(first).toBe(second);

    const detail = await first;
    expect(detail.error).toBeUndefined();
    expect(detail.comments).toHaveLength(1);
    expect(detail.contentSnapshot?.duty_description).toBe("NCOIC");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/feedback/session-1");
  });

  it("refetches after cache invalidation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ comments: [], contentSnapshot: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          comments: [{ id: "c2", section_key: "general", comment_text: "New", status: "pending", created_at: "" }],
          contentSnapshot: null,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await loadFeedbackSessionDetail("session-2", 1);
    invalidateFeedbackSessionDetailCache("session-2");
    const detail = await loadFeedbackSessionDetail("session-2", 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(detail.comments[0]?.id).toBe("c2");
  });

  it("returns an error payload instead of hanging the viewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Session not found" }),
      })
    );

    const detail = await loadFeedbackSessionDetail("missing", 0);
    expect(detail.comments).toEqual([]);
    expect(detail.error).toBe("Session not found");
  });
});

describe("loadFeedbackSessions", () => {
  it("shares one request per shell + bust key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [{ id: "s1", reviewer_name: "Alex", comment_count: 1 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = loadFeedbackSessions("epb", "shell-1", 3);
    const b = loadFeedbackSessions("epb", "shell-1", 3);
    expect(a).toBe(b);
    await a;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
