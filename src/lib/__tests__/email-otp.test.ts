import { describe, expect, it } from "vitest";
import {
  EMAIL_OTP_EXPIRY_SECONDS,
  confirmContinueCopy,
  emailOtpVerifyErrorPath,
  parseConfirmEmail,
  parseEmailOtpCode,
  parseEmailOtpType,
  parseTokenHash,
  redirectPathForEmailOtpType,
} from "@/lib/auth/email-otp";

describe("email OTP helpers", () => {
  it("keeps a 1-hour shared mailer TTL, not a 5-minute SMS window", () => {
    expect(EMAIL_OTP_EXPIRY_SECONDS).toBe(3600);
  });

  it("accepts GoTrue email OTP types and rejects others", () => {
    expect(parseEmailOtpType("magiclink")).toBe("magiclink");
    expect(parseEmailOtpType("signup")).toBe("signup");
    expect(parseEmailOtpType("recovery")).toBe("recovery");
    expect(parseEmailOtpType("email_change")).toBe("email_change");
    expect(parseEmailOtpType("sms")).toBeNull();
    expect(parseEmailOtpType("expired_token")).toBeNull();
    expect(parseEmailOtpType(null)).toBeNull();
  });

  it("accepts url-safe token hashes and rejects injection", () => {
    const hash = "a".repeat(32);
    expect(parseTokenHash(hash)).toBe(hash);
    expect(parseTokenHash("short")).toBeNull();
    expect(parseTokenHash(`${hash}&type=signup`)).toBeNull();
    expect(parseTokenHash(`${hash}/../`)).toBeNull();
  });

  it("accepts 6–8 digit email codes and strips spaces", () => {
    expect(parseEmailOtpCode("123456")).toBe("123456");
    expect(parseEmailOtpCode("1234 5678")).toBe("12345678");
    expect(parseEmailOtpCode("12345")).toBeNull();
    expect(parseEmailOtpCode("abcdef")).toBeNull();
  });

  it("normalizes emails and rejects junk", () => {
    expect(parseConfirmEmail(" Airman@Example.mil ")).toBe("airman@example.mil");
    expect(parseConfirmEmail("not-an-email")).toBeNull();
    expect(parseConfirmEmail("a@b")).toBeNull();
  });

  it("sends recovery to reset-password and honors next for sign-in", () => {
    expect(redirectPathForEmailOtpType("recovery", "/dashboard")).toBe(
      "/reset-password"
    );
    expect(redirectPathForEmailOtpType("magiclink", "/dashboard")).toBe(
      "/dashboard"
    );
    expect(redirectPathForEmailOtpType("signup", "/onboarding")).toBe(
      "/onboarding"
    );
  });

  it("does not put recovery failures back on the confirm GET", () => {
    expect(emailOtpVerifyErrorPath("recovery", "a".repeat(32), "/dashboard")).toBe(
      "/forgot-password?error=link_expired"
    );
    expect(emailOtpVerifyErrorPath("magiclink", "a".repeat(32), "/dashboard")).toContain(
      "/auth/confirm?"
    );
    expect(emailOtpVerifyErrorPath("magiclink", "a".repeat(32), "/dashboard")).toContain(
      "error=expired"
    );
  });

  it("asks the user to confirm they are on their own browser", () => {
    expect(confirmContinueCopy("magiclink").submit).toBe("Sign in");
    expect(confirmContinueCopy("magiclink").body).toMatch(/isolated web gateway/i);
  });
});
