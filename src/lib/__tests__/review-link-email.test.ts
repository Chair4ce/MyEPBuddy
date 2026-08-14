import { describe, expect, it } from "vitest";
import { buildReviewLinkEmail } from "@/lib/email/review-link";

describe("buildReviewLinkEmail", () => {
  it("builds an EPB review request with escaped HTML", () => {
    const email = buildReviewLinkEmail({
      siteUrl: "https://myepbuddy.com",
      senderDisplayName: "MSgt O'Malley",
      rateeName: 'Amn <script>alert("x")</script>',
      rateeRank: "Amn",
      mentorLabel: "Flight Chief",
      reviewUrl: "https://myepbuddy.com/review/epb/tok-123?x=1&y=2",
      expiresAt: "Aug 16, 2026, 12:00 AM UTC",
      shellType: "epb",
    });

    expect(email.subject).toBe(
      "MSgt O'Malley requested your feedback on their EPB"
    );
    expect(email.html).toContain("Hi Flight Chief");
    expect(email.html).toContain("MSgt O&#039;Malley");
    expect(email.html).toContain(
      "Amn Amn &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain(
      "https://myepbuddy.com/review/epb/tok-123?x=1&amp;y=2"
    );
    expect(email.html).toContain("Review &amp; provide feedback");
    expect(email.text).toContain("MSgt O'Malley has requested your feedback");
    expect(email.text).toContain(
      "https://myepbuddy.com/review/epb/tok-123?x=1&y=2"
    );
  });

  it("uses award wording and default greeting when mentor label is missing", () => {
    const email = buildReviewLinkEmail({
      siteUrl: "https://myepbuddy.com/",
      senderDisplayName: "Capt Lee",
      rateeName: "SSgt Rivera",
      rateeRank: null,
      mentorLabel: null,
      reviewUrl: "https://myepbuddy.com/review/award/tok-99",
      expiresAt: "soon",
      shellType: "award",
    });

    expect(email.subject).toBe(
      "Capt Lee requested your feedback on their award"
    );
    expect(email.html).toContain("Hi there");
    expect(email.html).toContain("award package");
    expect(email.text).toContain("award package");
  });
});
