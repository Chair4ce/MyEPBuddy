import { describe, expect, it } from "vitest";
import {
  buildManagedInviteLoginPath,
  buildManagedInviteSignupPath,
  parseManagedInviteParams,
  safeAppNextPath,
} from "@/lib/managed-member-invite-params";
import { buildManagedInviteCtaUrl } from "@/lib/email/managed-member-invite";

describe("managed invite params", () => {
  it("builds signup CTA with token and supervisor context", () => {
    const path = buildManagedInviteSignupPath({
      email: "Airman@Example.com",
      supervisorName: "MSgt Rivera",
      teamMemberId: "tm-123",
      token: "abc123token",
    });

    expect(path).toContain("/signup?");
    expect(path).toContain("email=airman%40example.com");
    expect(path).toContain("invite=1");
    expect(path).toContain("from=MSgt+Rivera");
    expect(path).toContain("tm=tm-123");
    expect(path).toContain("token=abc123token");
  });

  it("builds login CTA for existing users with token", () => {
    const path = buildManagedInviteLoginPath({
      email: "vet@example.com",
      supervisorName: "Capt Lee",
      token: "tok-9",
    });
    expect(path.startsWith("/login?")).toBe(true);
    expect(path).toContain("email=vet%40example.com");
    expect(path).toContain("invite=1");
    expect(path).toContain("token=tok-9");
  });

  it("parses invite params including token", () => {
    const params = parseManagedInviteParams(
      new URLSearchParams(
        "email=airman%40example.com&invite=1&from=MSgt%20Rivera&tm=abc&token=secret"
      )
    );
    expect(params).toEqual({
      email: "airman@example.com",
      supervisorName: "MSgt Rivera",
      teamMemberId: "abc",
      token: "secret",
      isInvite: true,
    });
  });

  it("treats token-only invite links as invites", () => {
    const params = parseManagedInviteParams(
      new URLSearchParams("invite=1&token=only-token&from=MSgt%20Rivera")
    );
    expect(params.isInvite).toBe(true);
    expect(params.token).toBe("only-token");
  });

  it("rejects open redirects in next", () => {
    expect(safeAppNextPath("https://evil.com", "https://myepbuddy.com")).toBe(
      "/dashboard"
    );
    expect(safeAppNextPath("//evil.com", "https://myepbuddy.com")).toBe(
      "/dashboard"
    );
    expect(
      safeAppNextPath(
        "https://myepbuddy.com/dashboard?invite=1",
        "https://myepbuddy.com"
      )
    ).toBe("/dashboard?invite=1");
  });

  it("builds absolute invite CTA URLs for email", () => {
    const url = buildManagedInviteCtaUrl(
      "https://myepbuddy.com",
      "new_user",
      "airman@example.com",
      "MSgt Rivera",
      "tm-1",
      "invite-token-1"
    );
    expect(url).toContain("token=invite-token-1");
    expect(url).toContain("email=airman%40example.com");
  });
});
