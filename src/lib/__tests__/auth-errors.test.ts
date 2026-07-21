import { describe, expect, it } from "vitest";
import {
  isEmailDeliveryError,
  isRateLimitError,
  parseAuthError,
} from "../auth-errors";

describe("parseAuthError", () => {
  it("maps otp_disabled to No account found", () => {
    const info = parseAuthError("otp_disabled");
    expect(info.title).toBe("No account found");
    expect(info.isRateLimit).toBe(false);
    expect(info.isEmailDelivery).toBe(false);
  });

  it("maps Signups not allowed for otp (case-insensitive)", () => {
    const info = parseAuthError("Signups not allowed for OTP");
    expect(info.title).toBe("No account found");
    expect(info.isRateLimit).toBe(false);
    expect(info.isEmailDelivery).toBe(false);
  });

  it("flags rate limit messages", () => {
    const info = parseAuthError("email rate limit exceeded");
    expect(info.isRateLimit).toBe(true);
    expect(isRateLimitError("email rate limit exceeded")).toBe(true);
  });

  it("maps already registered", () => {
    const info = parseAuthError("User already registered");
    expect(info.title).toBe("Email Already Registered");
  });

  it("falls back for unknown errors", () => {
    const info = parseAuthError("something totally unknown");
    expect(info.title).toBe("Authentication Error");
    expect(info.message).toBe("something totally unknown");
  });

  it("accepts { message } objects", () => {
    const info = parseAuthError({ message: "otp_disabled" });
    expect(info.title).toBe("No account found");
  });

  it("detects email delivery errors", () => {
    expect(isEmailDeliveryError("failed to send email")).toBe(true);
  });
});
