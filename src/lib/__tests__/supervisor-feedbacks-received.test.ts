import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFeedback, getMyReceivedFeedbacks } from "@/app/actions/supervisor-feedbacks";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
let lastSelectArg: string | undefined;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

function mockSharedFeedbacksQuery(rows: Record<string, unknown>[]) {
  const queryResult = Promise.resolve({ data: rows, error: null });
  const orderCreated = vi.fn().mockReturnValue(queryResult);
  const orderCycle = vi.fn().mockReturnValue({ order: orderCreated });
  const eqStatus = vi.fn().mockReturnValue({ order: orderCycle });
  const eqSub = vi.fn().mockReturnValue({ eq: eqStatus });
  const select = vi.fn().mockImplementation((sel: string) => {
    lastSelectArg = sel;
    return { eq: eqSub };
  });
  mockFrom.mockReturnValue({ select });
}

function mockSingleFeedbackQuery(row: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqId = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: eqId });
  mockFrom.mockReturnValue({ select });
}

describe("getMyReceivedFeedbacks", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
    lastSelectArg = undefined;
  });

  it("strips session_settings from shared feedback rows", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "ratee-1" } } });
    mockSharedFeedbacksQuery([
      {
        id: "fb-1",
        supervisor_id: "sup-1",
        subordinate_id: "ratee-1",
        team_member_id: null,
        feedback_type: "midterm",
        cycle_year: 2026,
        content: "Shared guide body",
        reviewed_accomplishment_ids: [],
        status: "shared",
        shared_at: "2026-01-01T00:00:00Z",
        supervision_start_date: "2025-06-01",
        supervision_end_date: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        session_settings: "PRIVATE SETTINGS",
        supervisor: { full_name: "Smith", rank: "MSgt" },
      },
    ]);

    const result = await getMyReceivedFeedbacks();

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.session_settings).toBe("");
    expect(result.data[0]?.content).toBe("Shared guide body");
    expect(lastSelectArg).toBeDefined();
    expect(lastSelectArg).not.toContain("session_settings");
  });
});

describe("getFeedback", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("strips session_settings when caller is not the supervisor", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "ratee-1" } } });
    mockSingleFeedbackQuery({
      id: "fb-1",
      supervisor_id: "sup-1",
      subordinate_id: "ratee-1",
      team_member_id: null,
      feedback_type: "midterm",
      cycle_year: 2026,
      content: "Shared guide",
      session_settings: "PRIVATE SETTINGS",
      reviewed_accomplishment_ids: [],
      status: "shared",
      shared_at: "2026-01-01T00:00:00Z",
      supervision_start_date: "2025-06-01",
      supervision_end_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      supervisor: { full_name: "Smith", rank: "MSgt" },
    });

    const result = await getFeedback("fb-1");

    expect(result.error).toBeNull();
    expect(result.data?.session_settings).toBe("");
  });

  it("returns session_settings for the supervisor", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "sup-1" } } });
    mockSingleFeedbackQuery({
      id: "fb-1",
      supervisor_id: "sup-1",
      subordinate_id: "ratee-1",
      team_member_id: null,
      feedback_type: "midterm",
      cycle_year: 2026,
      content: "Guide",
      session_settings: "PRIVATE SETTINGS",
      reviewed_accomplishment_ids: [],
      status: "draft",
      shared_at: null,
      supervision_start_date: "2025-06-01",
      supervision_end_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      supervisor: { full_name: "Smith", rank: "MSgt" },
    });

    const result = await getFeedback("fb-1");

    expect(result.error).toBeNull();
    expect(result.data?.session_settings).toBe("PRIVATE SETTINGS");
  });
});
