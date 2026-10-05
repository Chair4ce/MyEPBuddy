import { describe, expect, it } from "vitest";
import { buildInactivityNoticeEmail, inactivityLoginUrl } from "../inactivity-notice";

const base = {
  activityAt: "2025-12-20T07:00:00.000Z",
  suspendAt: "2026-12-20T07:00:00.000Z",
  deleteAt: "2027-01-19T07:00:00.000Z",
};

describe("inactivity notice email", () => {
  it("points the 60-day and 30-day buttons at the login page", () => {
    expect(inactivityLoginUrl("notice_60")).toBe(
      "https://www.myepbuddy.com/login?next=%2Fdashboard&utm_campaign=inactivity-60"
    );
    expect(inactivityLoginUrl("notice_30")).toContain("utm_campaign=inactivity-30");
    expect(inactivityLoginUrl("suspended")).toContain("utm_campaign=inactivity-suspended");
  });

  it("states the real dates and that credits survive suspension only", () => {
    const email = buildInactivityNoticeEmail({ kind: "notice_60", ...base });
    expect(email.subject).toBe("Your MyEPBuddy account will be suspended on December 20, 2026");
    expect(email.html).toContain("December 2025");
    expect(email.html).toContain("December 20, 2026");
    expect(email.html).toContain("January 19, 2027");
    expect(email.text).toContain("AI credits stay on the account while it is suspended");
    expect(email.text).toContain("unused AI credits are lost");
    expect(email.html).toContain("Sign in to MyEPBuddy");
    expect(email.text).toContain("You're receiving this because it affects your account");
    expect(email.html).toContain("affects your account");
  });

  it("makes the 30-day copy the final reminder and the suspended copy a restore link", () => {
    const reminder = buildInactivityNoticeEmail({ kind: "notice_30", ...base });
    const suspended = buildInactivityNoticeEmail({ kind: "suspended", ...base });
    expect(reminder.subject).toContain("Reminder: sign in by December 20, 2026");
    expect(reminder.text).toContain("This is your final reminder.");
    expect(suspended.subject).toBe("Your MyEPBuddy account was suspended for inactivity");
    expect(suspended.text).toContain("Sign in anytime before January 19, 2027");
  });

  it("stays transactional", () => {
    const email = buildInactivityNoticeEmail({ kind: "notice_60", ...base });
    expect(email.html).not.toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(email.html).not.toContain("unsubscribe");
    expect(email.html.toLowerCase()).not.toContain("magic");
    expect(email.html).not.toContain("product update");
    expect(email.text).not.toContain("token=");
    expect(email.ctaUrl).not.toContain("supabase.co");
  });

  it("escapes a hostile activity month if one is ever interpolated raw", () => {
    const email = buildInactivityNoticeEmail({
      kind: "notice_60",
      ...base,
      activityAt: base.activityAt,
    });
    expect(email.html).not.toContain("<script>");
  });
});
