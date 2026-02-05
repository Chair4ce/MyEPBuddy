import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error_description = searchParams.get("error_description");

  // Handle error from auth provider
  if (error_description) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }

    // Code exchange failed - this commonly happens when:
    // 1. User opens verification email in a different browser/device than where they signed up
    // 2. The PKCE code_verifier cookie is missing or expired
    // 3. The verification link was already used
    //
    // Important: Supabase doesn't forward the 'type' parameter to the callback.
    // When a user clicks the email verification link, Supabase verifies the email
    // BEFORE redirecting here. So if we have a code but exchange fails, the email
    // was likely verified successfully - we just can't create a session because
    // the PKCE verifier is missing (opened in different browser).
    //
    // Check if this is a password recovery flow by looking at the 'next' parameter
    if (next === "/reset-password") {
      // Password recovery link opened in different browser
      return NextResponse.redirect(
        `${origin}/forgot-password?error=link_expired`
      );
    }

    // For all other cases (signup, email change, etc.), assume email was verified
    // and prompt user to sign in manually
    return NextResponse.redirect(
      `${origin}/login?email_verified=true`
    );
  }

  // No code provided - shouldn't normally happen
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}





