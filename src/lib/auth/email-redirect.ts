/**
 * Base URL that Supabase auth emails (magic link, signup confirmation, password
 * recovery) should return the user to.
 *
 * We return the current deployment origin (scheme + host, no path) so that links
 * requested from a Vercel preview deployment come back to that same preview
 * instead of the project's fixed production Site URL. Supabase renders this value
 * as `{{ .RedirectTo }}` and the email templates prepend it to
 * `/auth/confirm?...`, so this must be the origin only.
 *
 * For the origin to be honored, the deployment URL must be allow-listed under
 * Supabase Auth > URL Configuration > Redirect URLs (a wildcard such as
 * `https://*-<team>.vercel.app` covers preview deployments).
 */
export function getAuthEmailRedirectBase(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
