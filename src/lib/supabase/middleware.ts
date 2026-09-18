import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { safePostAuthPath } from "@/lib/managed-member-invite-params";
import { isSocialPreviewPath } from "@/lib/site-url";

type CookieToSet = {
  name: string;
  value: string;
  options?: Partial<ResponseCookie>;
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicPaths = [
    "/",
    "/login",
    "/signup",
    "/phone-login",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
    "/privacy",
    "/terms",
    "/billing-terms",
    "/account-deleted",
    "/email-preview/managed-invite",
  ];
  const isPublicPath =
    isSocialPreviewPath(request.nextUrl.pathname) ||
    publicPaths.some(
      (path) =>
        request.nextUrl.pathname === path ||
        request.nextUrl.pathname.startsWith("/auth/") ||
        request.nextUrl.pathname.startsWith("/review/") ||
        request.nextUrl.pathname.startsWith("/email-preview/") ||
        request.nextUrl.pathname.startsWith("/email-previews/")
    );

  // API routes enforce their own auth (webhooks, cron, etc.)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", requested);
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup" ||
      request.nextUrl.pathname === "/phone-login" ||
      request.nextUrl.pathname === "/forgot-password")
  ) {
    const next = safePostAuthPath(
      request.nextUrl.searchParams.get("next"),
      request.nextUrl.origin
    );
    const url = request.nextUrl.clone();
    const dest = new URL(next, request.nextUrl.origin);
    if (dest.origin !== request.nextUrl.origin) {
      dest.pathname = "/dashboard";
      dest.search = "";
      dest.hash = "";
    }
    url.pathname = dest.pathname;
    url.search = dest.search;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

