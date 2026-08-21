import { describe, expect, it } from "vitest";
import {
  buildCycleReminderCtaUrl,
  buildCycleReminderEmail,
} from "../cycle-reminder";

describe("buildCycleReminderCtaUrl", () => {
  it("sends them to login, then entries", () => {
    const url = buildCycleReminderCtaUrl("https://www.myepbuddy.com/", "scod-msgt-20260821");
    expect(url).toContain("https://www.myepbuddy.com/login?");
    expect(url).toContain("next=%2Fentries");
    expect(url).toContain("utm_campaign=scod-msgt-20260821");
  });
});

describe("buildCycleReminderEmail", () => {
  it("matches official email chrome and Generate my EPB CTA", () => {
    const email = buildCycleReminderEmail({
      siteUrl: "https://www.myepbuddy.com",
      rank: "MSgt",
      closeoutDateLabel: "30 September",
      send: "catchup",
      campaign: "scod-msgt-20260821",
    });

    expect(email.subject).toBe("It's time to write your EPB");
    expect(email.html).toContain("MyEPBuddy");
    expect(email.html).toContain("/icon-email.png");
    expect(email.html).toContain("Generate my EPB");
    expect(email.html).toContain("login?");
    expect(email.html).toContain("next=%2Fentries");
    expect(email.html).toContain("#818cf8");
    expect(email.html).toContain("font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif");
    expect(email.html).toContain("It&#039;s time to write your EPB — MSgt closeout is 30 September.");
    expect(email.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(email.html).toContain("Oaiken LLC");
    expect(email.text).toContain("Generate my EPB:");
  });

  it("varies copy by send", () => {
    const supervisor = buildCycleReminderEmail({
      siteUrl: "https://www.myepbuddy.com",
      rank: "TSgt",
      closeoutDateLabel: "30 November",
      send: "supervisor_soon",
    });
    const chief = buildCycleReminderEmail({
      siteUrl: "https://www.myepbuddy.com",
      rank: "TSgt",
      closeoutDateLabel: "30 November",
      send: "chief_soon",
    });
    expect(supervisor.subject).toBe("It's time to write your EPB");
    expect(chief.subject).toBe("Your EPB deadline is approaching");
    expect(supervisor.html).toContain("due to your supervisor in 5 days");
    expect(chief.html).toContain("due to your chief in 15 days");
  });

  it("escapes rank and date in HTML", () => {
    const email = buildCycleReminderEmail({
      siteUrl: "https://www.myepbuddy.com",
      rank: 'MSgt <script>alert("x")</script>',
      closeoutDateLabel: "30 September",
      send: "catchup",
    });
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("MSgt &lt;script&gt;");
  });
});
