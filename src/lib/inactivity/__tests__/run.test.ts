import { describe, expect, it, vi } from "vitest";
import { addDays, earliestSuspendAt } from "../schedule";
import {
  runInactivityJob,
  type InactivityDueRow,
  type InactivityMailer,
  type InactivityStore,
} from "../run";

const ACTIVITY = new Date("2025-01-01T00:00:00.000Z");
const NOW = addDays(ACTIVITY, 305);

function noticeRow(overrides: Partial<InactivityDueRow> = {}): InactivityDueRow {
  const suspendAt = earliestSuspendAt({
    now: NOW,
    activityAt: ACTIVITY,
    stage: "notice_60",
  });
  return {
    user_id: "11111111-1111-4111-8111-111111111111",
    email: "person@example.com",
    activity_at: ACTIVITY.toISOString(),
    due_stage: "notice_60",
    scheduled_suspend_at: suspendAt.toISOString(),
    scheduled_delete_at: addDays(suspendAt, 30).toISOString(),
    notice_60_sent_at: null,
    notice_30_sent_at: null,
    already_suspended: false,
    email_suppressed: false,
    suspended_at: null,
    ...overrides,
  };
}

function createHarness(rows: Partial<Record<InactivityDueRow["due_stage"], InactivityDueRow[]>> = {}) {
  const calls: string[] = [];
  const sent: string[] = [];
  const store: InactivityStore = {
    cancelStale: vi.fn(async () => {
      calls.push("cancel");
      return 2;
    }),
    due: vi.fn(async (stage: InactivityDueRow["due_stage"]) => {
      calls.push(`due:${stage}`);
      return rows[stage] ?? [];
    }),
    sentCount: vi.fn(async () => {
      calls.push("sentCount");
      return 0;
    }),
    claim: vi.fn(async (row) => {
      calls.push(`claim:${row.due_stage}`);
      return "notice-id";
    }),
    markSent: vi.fn(async () => {
      calls.push("markSent");
    }),
    markFailed: vi.fn(async () => {
      calls.push("markFailed");
    }),
    markSkipped: vi.fn(async () => {
      calls.push("markSkipped");
    }),
    suspendUser: vi.fn(async () => {
      calls.push("suspend");
    }),
    deleteUser: vi.fn(async () => {
      calls.push("delete");
    }),
  };
  const mailer: InactivityMailer = {
    send: vi.fn(async (input) => {
      sent.push(input.to);
      calls.push("send");
      return { id: "email_1" };
    }),
  };
  return { store, mailer, calls, sent };
}

const caps = { noticeDaily: 25, suspendPerRun: 25, deleteWeekly: 25 };

describe("runInactivityJob", () => {
  it("dry-run counts due notices and does not send, claim, cancel, or suspend", async () => {
    const { store, mailer, calls, sent } = createHarness({
      notice_60: [noticeRow()],
    });

    const result = await runInactivityJob({
      now: NOW,
      modes: { notices: "dry_run", suspend: "off", delete: "off" },
      caps,
      store,
      mailer,
    });

    expect(result.notices.due).toBe(1);
    expect(result.notices.sent).toBe(0);
    expect(result.cancelled).toBe(0);
    expect(sent).toEqual([]);
    expect(calls).not.toContain("send");
    expect(calls).not.toContain("claim:notice_60");
    expect(calls).not.toContain("cancel");
    expect(calls).not.toContain("suspend");
    expect(calls).not.toContain("delete");
    expect(JSON.stringify(result)).not.toContain("@");
    expect(JSON.stringify(result)).not.toContain("person@example.com");
  });

  it("live notices send once and cancel stale cycles first", async () => {
    const { store, mailer, calls } = createHarness({
      notice_60: [noticeRow()],
    });

    const result = await runInactivityJob({
      now: NOW,
      modes: { notices: "live", suspend: "off", delete: "off" },
      caps,
      store,
      mailer,
    });

    expect(result.cancelled).toBe(2);
    expect(result.notices.sent).toBe(1);
    expect(calls[0]).toBe("cancel");
    expect(mailer.send).toHaveBeenCalledOnce();
    const payload = vi.mocked(mailer.send).mock.calls[0][0];
    expect(payload.idempotencyKey).toContain("notice_60");
    expect(payload.tags).toEqual([
      { name: "category", value: "inactivity" },
      { name: "notice", value: "60" },
    ]);
    expect(JSON.stringify(result)).not.toContain("person@example.com");
  });

  it("stops at the daily email cap", async () => {
    const { store, mailer, calls } = createHarness({
      notice_60: [noticeRow(), noticeRow({ user_id: "22222222-2222-4222-8222-222222222222" })],
    });
    vi.mocked(store.sentCount).mockResolvedValue(24);

    const result = await runInactivityJob({
      now: NOW,
      modes: { notices: "live", suspend: "off", delete: "off" },
      caps,
      store,
      mailer,
    });

    expect(result.notices.sent).toBe(1);
    expect(result.capped).toBe(true);
    expect(calls.filter((call) => call === "send")).toHaveLength(1);
  });

  it("does not email a date that shortens the warning", async () => {
    const tooEarly = addDays(ACTIVITY, 364);
    const { store, mailer } = createHarness({
      notice_60: [
        noticeRow({
          scheduled_suspend_at: tooEarly.toISOString(),
          scheduled_delete_at: addDays(tooEarly, 30).toISOString(),
        }),
      ],
    });

    const result = await runInactivityJob({
      now: NOW,
      modes: { notices: "live", suspend: "off", delete: "off" },
      caps,
      store,
      mailer,
    });

    expect(result.notices.failed).toBe(1);
    expect(result.notices.sent).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledOnce();
  });

  it("suspends without sending when the address is suppressed, and keeps data until delete is live", async () => {
    const suspendAt = earliestSuspendAt({
      now: addDays(ACTIVITY, 365),
      activityAt: ACTIVITY,
      stage: "suspended",
      notice60SentAt: addDays(ACTIVITY, 305),
      notice30SentAt: addDays(ACTIVITY, 335),
    });
    const row = noticeRow({
      due_stage: "suspended",
      scheduled_suspend_at: suspendAt.toISOString(),
      scheduled_delete_at: addDays(suspendAt, 30).toISOString(),
      notice_60_sent_at: addDays(ACTIVITY, 305).toISOString(),
      notice_30_sent_at: addDays(ACTIVITY, 335).toISOString(),
      email_suppressed: true,
    });
    const { store, mailer } = createHarness({ suspended: [row] });

    const result = await runInactivityJob({
      now: addDays(ACTIVITY, 365),
      modes: { notices: "off", suspend: "live", delete: "off" },
      caps,
      store,
      mailer,
    });

    expect(result.suspend.acted).toBe(1);
    expect(result.suspend.skipped).toBe(1);
    expect(result.delete.acted).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.deleteUser).not.toHaveBeenCalled();
  });

  it("caps deletions for the week and does not send mail", async () => {
    const suspendedAt = addDays(ACTIVITY, 365);
    const deleteAt = addDays(ACTIVITY, 395);
    const row = noticeRow({
      due_stage: "deleted",
      scheduled_suspend_at: suspendedAt.toISOString(),
      scheduled_delete_at: deleteAt.toISOString(),
      suspended_at: suspendedAt.toISOString(),
      notice_60_sent_at: addDays(ACTIVITY, 305).toISOString(),
      notice_30_sent_at: addDays(ACTIVITY, 335).toISOString(),
      already_suspended: true,
    });
    const { store, mailer } = createHarness({ deleted: [row, row] });
    vi.mocked(store.sentCount).mockImplementation(async (_since, types) =>
      types.includes("deleted") ? 24 : 0
    );

    const result = await runInactivityJob({
      now: deleteAt,
      modes: { notices: "off", suspend: "off", delete: "live" },
      caps,
      store,
      mailer,
    });

    expect(result.delete.acted).toBe(1);
    expect(result.capped).toBe(true);
    expect(store.deleteUser).toHaveBeenCalledOnce();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
