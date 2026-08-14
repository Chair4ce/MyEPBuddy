import { describe, expect, it } from "vitest";
import { buildMentorFeedbackReceivedEmail } from "@/lib/email/mentor-feedback-received";

describe("buildMentorFeedbackReceivedEmail", () => {
  it("builds an escaped owner notification", () => {
    const email = buildMentorFeedbackReceivedEmail({
      siteUrl: "https://myepbuddy.com",
      recipientName: "MSgt O'Malley",
      reviewerName: 'Chief <script>alert("x")</script>',
      rateeName: "SSgt Rivera",
      rateeRank: "SSgt",
      shellType: "epb",
      commentCount: 3,
    });

    expect(email.subject).toBe(
      'Chief <script>alert("x")</script> left feedback on your EPB'
    );
    expect(email.html).toContain("Hi MSgt O&#039;Malley");
    expect(email.html).toContain(
      "Chief &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("3 comments");
    expect(email.html).toContain("https://myepbuddy.com/generate");
    expect(email.text).toContain("3 comments");
  });

  it("uses singular comment wording and award path", () => {
    const email = buildMentorFeedbackReceivedEmail({
      siteUrl: "https://myepbuddy.com/",
      recipientName: null,
      reviewerName: "Flight Chief",
      rateeName: "Amn Jones",
      shellType: "award",
      commentCount: 1,
      appPath: "/award",
    });

    expect(email.subject).toContain("award");
    expect(email.html).toContain("Hi there");
    expect(email.html).toContain("1 comment");
    expect(email.html).toContain("https://myepbuddy.com/award");
  });
});
