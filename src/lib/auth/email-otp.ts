import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Shared mailer OTP lifetime for magic link, confirm-signup, recovery, and
 * email-change. This is GoTrue `GOTRUE_MAILER_OTP_EXP` / Dashboard
 * Authentication → Email → OTP expiration — not Phone OTP and not JWT expiry.
 *
 * Hosted projects must set the Email provider value to match; local is
 * `otp_expiry` under `[auth.email]` in supabase/config.toml.
 */
export const EMAIL_OTP_EXPIRY_SECONDS = 3600;
export const EMAIL_OTP_EXPIRY_LABEL = "1 hour";

export const EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

export type AppEmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

const EMAIL_OTP_TYPE_SET = new Set<string>(EMAIL_OTP_TYPES);

export function parseEmailOtpType(value: unknown): AppEmailOtpType | null {
  if (typeof value !== "string") return null;
  return EMAIL_OTP_TYPE_SET.has(value) ? (value as AppEmailOtpType) : null;
}

/** GoTrue token_hash is url-safe; reject anything that could alter the URL. */
export function parseTokenHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 16 || trimmed.length > 255) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Email OTP digits from `{{ .Token }}` — GoTrue uses 6 or 8 depending on config. */
export function parseEmailOtpCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(digits)) return null;
  return digits;
}

export function parseConfirmEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  return email;
}

export function redirectPathForEmailOtpType(
  type: AppEmailOtpType,
  next: string
): string {
  if (type === "recovery") return "/reset-password";
  return next || "/dashboard";
}

export function confirmContinueCopy(type: AppEmailOtpType): {
  title: string;
  body: string;
  submit: string;
} {
  switch (type) {
    case "recovery":
      return {
        title: "Reset your password",
        body: "Continue only if this is your own browser — not a preview from an email scanner or isolated web gateway.",
        submit: "Continue to reset password",
      };
    case "signup":
    case "invite":
    case "email":
      return {
        title: "Confirm your email",
        body: "Continue only if this is your own browser — not a preview from an email scanner or isolated web gateway.",
        submit: "Confirm email",
      };
    case "email_change":
      return {
        title: "Confirm your new email",
        body: "Continue only if this is your own browser — not a preview from an email scanner or isolated web gateway.",
        submit: "Confirm email change",
      };
    default:
      return {
        title: "Sign in to MyEPBuddy",
        body: "Continue only if this is your own browser — not a preview from an email scanner or isolated web gateway.",
        submit: "Sign in",
      };
  }
}

export function emailOtpVerifyErrorPath(
  type: AppEmailOtpType,
  tokenHash: string,
  next: string
): string {
  if (type === "recovery") {
    return "/forgot-password?error=link_expired";
  }

  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    error: "expired",
  });
  if (next && next !== "/dashboard") {
    params.set("next", next);
  }
  return `/auth/confirm?${params.toString()}`;
}
