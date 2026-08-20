/** Shared invite deep-link params for managed-account Accept Invitation flow. */

export const MANAGED_INVITE_FLAG = "1";
export const PENDING_LINKS_HASH = "pending-account-links";

export type ManagedInviteParams = {
  email: string;
  supervisorName: string | null;
  teamMemberId: string | null;
  token: string | null;
  isInvite: boolean;
};

function readManagedInviteFlag(searchParams: URLSearchParams): string | null {
  for (const [key, value] of searchParams) {
    if (key === "invite") return value;
  }
  return null;
}

/**
 * UI prefill hint only — account linking requires server-side invite token validation.
 */
export function safeManagedInviteUiHint(
  searchParams: URLSearchParams,
  hasIdentityHint: boolean
): boolean {
  return (
    readManagedInviteFlag(searchParams) === MANAGED_INVITE_FLAG && hasIdentityHint
  );
}

export function parseManagedInviteParams(
  searchParams: URLSearchParams
): ManagedInviteParams {
  const rawEmail = searchParams.get("email")?.trim() || "";
  const email =
    rawEmail && rawEmail.includes("@") ? rawEmail.toLowerCase() : "";
  const supervisorName = searchParams.get("from")?.trim() || null;
  const teamMemberId = searchParams.get("tm")?.trim() || null;
  const token = searchParams.get("token")?.trim() || null;
  const hasIdentityHint = Boolean(token) || Boolean(email);
  const isInvite = safeManagedInviteUiHint(searchParams, hasIdentityHint);

  return {
    email,
    supervisorName,
    teamMemberId,
    token,
    isInvite,
  };
}

export function buildManagedInviteQuery(params: {
  email?: string | null;
  supervisorName?: string | null;
  teamMemberId?: string | null;
  token?: string | null;
}): string {
  const query = new URLSearchParams({
    invite: MANAGED_INVITE_FLAG,
  });
  if (params.email?.trim()) {
    query.set("email", params.email.trim().toLowerCase());
  }
  if (params.supervisorName?.trim()) {
    query.set("from", params.supervisorName.trim());
  }
  if (params.teamMemberId?.trim()) {
    query.set("tm", params.teamMemberId.trim());
  }
  if (params.token?.trim()) {
    query.set("token", params.token.trim());
  }
  return query.toString();
}

export function buildManagedInviteSignupPath(params: {
  email?: string | null;
  supervisorName?: string | null;
  teamMemberId?: string | null;
  token?: string | null;
}): string {
  return `/signup?${buildManagedInviteQuery(params)}`;
}

export function buildManagedInviteLoginPath(params: {
  email?: string | null;
  supervisorName?: string | null;
  teamMemberId?: string | null;
  token?: string | null;
  emailVerifiedPending?: boolean;
}): string {
  const query = new URLSearchParams(buildManagedInviteQuery(params));
  if (params.emailVerifiedPending) {
    query.set("email_verified", "pending");
  }
  return `/login?${query.toString()}`;
}

/** Post-auth destination that surfaces the pending-link card. */
export function buildManagedInviteDashboardPath(): string {
  return `/dashboard?invite=${MANAGED_INVITE_FLAG}#${PENDING_LINKS_HASH}`;
}

/** In-memory only — invite tokens must not persist in web storage (XSS risk). */
let pendingInviteToken: string | null = null;

export function persistManagedInviteToken(token: string | null | undefined): void {
  const value = token?.trim();
  if (!value) return;
  pendingInviteToken = value;
}

export function readPersistedManagedInviteToken(): string | null {
  return pendingInviteToken;
}

export function clearPersistedManagedInviteToken(): void {
  pendingInviteToken = null;
}

/**
 * Prevent open redirects: only same-origin absolute URLs or relative app paths.
 * Protocol-relative and `https://our.host//evil.tld` pathnames are rejected.
 */
export function safeAppNextPath(
  next: string | null | undefined,
  origin: string
): string {
  if (!next) return "/dashboard";

  try {
    const allowedOrigin = new URL(origin).origin;
    const parsed = next.startsWith("/")
      ? new URL(next, allowedOrigin)
      : new URL(next);
    if (parsed.origin !== allowedOrigin) return "/dashboard";

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/dashboard";
    if (!path.startsWith("/") || path.startsWith("//")) return "/dashboard";
    return path;
  } catch {
    return "/dashboard";
  }
}

const AUTH_ENTRY_PREFIXES = [
  "/login",
  "/signup",
  "/phone-login",
  "/forgot-password",
] as const;

/**
 * Post-login destination. Same open-redirect rules as safeAppNextPath,
 * plus no loops back onto auth screens.
 */
export function safePostAuthPath(
  next: string | null | undefined,
  origin: string
): string {
  const path = safeAppNextPath(next, origin);
  if (AUTH_ENTRY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`))) {
    return "/dashboard";
  }
  return path;
}
