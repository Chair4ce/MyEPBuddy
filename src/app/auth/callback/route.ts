import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error_description = searchParams.get("error_description");
  const type = searchParams.get("type");

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
    
    // For signup verification, the email IS verified at this point (Supabase verified it
    // before redirecting here), but we couldn't create a session. Redirect with success.
    if (type === "signup" || type === "email") {
      return NextResponse.redirect(
        `${origin}/login?email_verified=true`
      );
    }

    // For password recovery, redirect to indicate they should try again
    if (type === "recovery") {
      return NextResponse.redirect(
        `${origin}/forgot-password?error=link_expired`
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}





