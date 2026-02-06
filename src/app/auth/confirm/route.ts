import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Token-hash based email verification route.
 *
 * Unlike the PKCE-based /auth/callback route, this route does NOT require
 * a code_verifier cookie. It verifies the token_hash directly with Supabase
 * using verifyOtp, which means it works reliably even when:
 *   - The user opens the email link in a different browser/device
 *   - An email client pre-fetches/previews the link
 *   - Cookies have been cleared between requesting and clicking the link
 *
 * The Supabase email template must be configured to use:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
 * instead of the default {{ .ConfirmationURL }}
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid verification link")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type,
  });

  if (error) {
    // Verification failed - token expired, already used, or invalid
    if (type === "recovery") {
      return NextResponse.redirect(
        `${origin}/forgot-password?error=link_expired`
      );
    }

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Verification link is invalid or has expired")}`
    );
  }

  // Verification succeeded - redirect based on type
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  let redirectTo: string;
  if (type === "recovery") {
    redirectTo = "/reset-password";
  } else {
    redirectTo = next;
  }

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${redirectTo}`);
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${redirectTo}`);
  } else {
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }
}
