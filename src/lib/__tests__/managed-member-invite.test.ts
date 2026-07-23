import { describe, expect, it } from "vitest";
import { buildManagedMemberInviteEmail } from "@/lib/email/managed-member-invite";

describe("buildManagedMemberInviteEmail", () => {
  it("builds a new-user invite with signup CTA and escaped HTML", () => {
    const email = buildManagedMemberInviteEmail({
      siteUrl: "https://myepbuddy.com",
      recipientEmail: "airman@example.com",
      recipientName: 'Amn <script>alert("x")</script>',
      supervisorDisplayName: "MSgt O'Malley",
      variant: "new_user",
    });

    expect(email.subject).toBe("MSgt O'Malley invited you to MyEPBuddy");
    expect(email.html).toContain("You&#039;re invited!");
    expect(email.html).toContain("Invited by MSgt O&#039;Malley");
    expect(email.html).toContain("MSgt O&#039;Malley");
    expect(email.html).toContain("Amn &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("invite=1");
    expect(email.html).toContain("Accept Invitation");
    expect(email.html).toContain("personal email");
    expect(email.text).toContain("Invited by MSgt O'Malley");
  });

  it("builds an existing-user invite with login CTA", () => {
    const email = buildManagedMemberInviteEmail({
      siteUrl: "https://myepbuddy.com/",
      recipientEmail: "vet@example.com",
      recipientName: "SSgt Rivera",
      supervisorDisplayName: "Capt Lee",
      teamMemberId: "tm-99",
      inviteToken: "tok-99",
      variant: "existing_user",
    });

    expect(email.subject).toBe("Capt Lee added you on MyEPBuddy");
    expect(email.html).toContain("You&#039;re on a team");
    expect(email.html).toContain("Invited by Capt Lee");
    expect(email.html).toContain("token=tok-99");
    expect(email.html).toContain("Log in to MyEPBuddy");
    expect(email.text).toContain("Invited by Capt Lee");
    expect(email.text).toContain("Log in to review the request");
  });
});
