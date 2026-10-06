import { describe, expect, it } from "vitest";
import {
  addDays,
  earliestDeleteAt,
  earliestNotice30At,
  earliestSuspendAt,
  formatInactivityDate,
  formatInactivityMonth,
  inactivityIdempotencyKey,
  phoenixDayStart,
  phoenixWeekStart,
  suspendDateHonorsRule,
} from "../schedule";

const ACTIVITY = new Date("2025-01-01T00:00:00.000Z");

describe("inactivity schedule", () => {
  it("names day 365 when the 60-day notice goes out on time", () => {
    const now = addDays(ACTIVITY, 305);
    expect(
      earliestSuspendAt({ now, activityAt: ACTIVITY, stage: "notice_60" }).toISOString()
    ).toBe(addDays(ACTIVITY, 365).toISOString());
  });

  it("pushes suspension 60 days after a late 60-day notice", () => {
    const now = addDays(ACTIVITY, 320);
    expect(
      earliestSuspendAt({ now, activityAt: ACTIVITY, stage: "notice_60" }).toISOString()
    ).toBe(addDays(ACTIVITY, 380).toISOString());
  });

  it("holds the 30-day notice until 30 days after the 60-day send", () => {
    const sent = addDays(ACTIVITY, 320);
    expect(earliestNotice30At(ACTIVITY, sent).toISOString()).toBe(
      addDays(ACTIVITY, 350).toISOString()
    );
    expect(earliestNotice30At(ACTIVITY, addDays(ACTIVITY, 305)).toISOString()).toBe(
      addDays(ACTIVITY, 335).toISOString()
    );
  });

  it("does not suspend until both notice gaps have elapsed", () => {
    const notice60 = addDays(ACTIVITY, 340);
    const notice30 = addDays(ACTIVITY, 370);
    const tooSoon = addDays(ACTIVITY, 399);
    const ready = addDays(ACTIVITY, 400);

    expect(
      earliestSuspendAt({
        now: tooSoon,
        activityAt: ACTIVITY,
        stage: "suspended",
        notice60SentAt: notice60,
        notice30SentAt: notice30,
      }).toISOString()
    ).toBe(ready.toISOString());

    expect(suspendDateHonorsRule(tooSoon.toISOString(), ready)).toBe(false);
    expect(suspendDateHonorsRule(ready.toISOString(), ready)).toBe(true);
    expect(suspendDateHonorsRule(addDays(ready, 1).toISOString(), ready)).toBe(true);
  });

  it("deletes at day 395 or 30 days after a late suspension", () => {
    const onTime = addDays(ACTIVITY, 365);
    expect(earliestDeleteAt(ACTIVITY, onTime).toISOString()).toBe(
      addDays(ACTIVITY, 395).toISOString()
    );

    const late = addDays(ACTIVITY, 400);
    expect(earliestDeleteAt(ACTIVITY, late).toISOString()).toBe(
      addDays(ACTIVITY, 430).toISOString()
    );
  });

  it("formats dates in America/Phoenix", () => {
    expect(formatInactivityDate("2026-12-20T07:00:00.000Z")).toBe("December 20, 2026");
    expect(formatInactivityMonth("2025-12-20T07:00:00.000Z")).toBe("December 2025");
  });

  it("uses Phoenix midnights for the daily and weekly caps", () => {
    const cron = new Date("2026-10-05T16:00:00.000Z");
    expect(phoenixDayStart(cron).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(phoenixWeekStart(cron).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    const previousSunday = new Date("2026-10-05T06:00:00.000Z");
    expect(phoenixWeekStart(previousSunday).toISOString()).toBe("2026-09-28T07:00:00.000Z");
  });

  it("builds a stable idempotency key without the email address", () => {
    const key = inactivityIdempotencyKey(
      "11111111-1111-4111-8111-111111111111",
      "notice_60",
      "2025-01-01T00:00:00.000Z"
    );
    expect(key).toBe(
      "inactivity/11111111-1111-4111-8111-111111111111/notice_60/1735689600"
    );
    expect(key).not.toContain("@");
  });
});
