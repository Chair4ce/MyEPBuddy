import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon, static assets
     * - signed webhooks (must not wait on supabase.auth.getUser())
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|opengraph-image|twitter-image|icon|apple-icon|api/webhooks/|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)",
  ],
};





