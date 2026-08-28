"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  emailOtpVerifyErrorPath,
  parseEmailOtpType,
  parseTokenHash,
  redirectPathForEmailOtpType,
} from "@/lib/auth/email-otp";
import { safeAppNextPath } from "@/lib/managed-member-invite-params";

function requestOrigin(headerList: Headers): string {
  const forwardedHost = headerList.get("x-forwarded-host");
  const forwardedProto = headerList.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto === "http" ? "http" : "https"}://${forwardedHost}`;
  }
  const origin = headerList.get("origin");
  if (origin) return origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Consumes the email token only on POST. GET /auth/confirm must never call
 * verifyOtp — Menlo, Safe Links, and other scanners prefetch GET and would
 * burn the one-time token before the user reaches their own browser.
 */
export async function confirmEmailOtpToken(formData: FormData) {
  const tokenHash = parseTokenHash(formData.get("token_hash"));
  const type = parseEmailOtpType(formData.get("type"));
  const headerList = await headers();
  const origin = requestOrigin(headerList);
  const next = safeAppNextPath(String(formData.get("next") || ""), origin);

  if (!tokenHash || !type) {
    redirect(
      `/login?error=${encodeURIComponent("Invalid verification link")}`
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    redirect(emailOtpVerifyErrorPath(type, tokenHash, next));
  }

  redirect(redirectPathForEmailOtpType(type, next));
}
