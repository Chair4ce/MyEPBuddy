/** Shared invite deep-link params for managed-account Accept Invitation flow. */

export const MANAGED_INVITE_FLAG = "1";
export const PENDING_LINKS_HASH = "pending-account-links";
export const MANAGED_INVITE_TOKEN_STORAGE_KEY = "managed_invite_token";

export type ManagedInviteParams = {
  email: string;
  supervisorName: string | null;
  teamMemberId: string | null;
  token: string | null;
  isInvite: boolean;
};

export function parseManagedInviteParams(
  searchParams: URLSearchParams
): ManagedInviteParams {
  const rawEmail = searchParams.get("email")?.trim() || "";
  const email =
    rawEmail && rawEmail.includes("@") ? rawEmail.toLowerCase() : "";
  const supervisorName = searchParams.get("from")?.trim() || null;
  const teamMemberId = searchParams.get("tm")?.trim() || null;
  const token = searchParams.get("token")?.trim() || null;
  const isInvite =
    searchParams.get("invite") === MANAGED_INVITE_FLAG &&
    (Boolean(token) || Boolean(email));

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

export function persistManagedInviteToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const value = token?.trim();
  if (!value) return;
  try {
    window.sessionStorage.setItem(MANAGED_INVITE_TOKEN_STORAGE_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export function readPersistedManagedInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(MANAGED_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPersistedManagedInviteToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(MANAGED_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Prevent open redirects: only same-origin absolute URLs or relative app paths.
 */
export function safeAppNextPath(
  next: string | null | undefined,
  origin: string
): string {
  if (!next) return "/dashboard";

  try {
    if (next.startsWith("/")) {
      if (next.startsWith("//")) return "/dashboard";
      return next;
    }

    const parsed = new URL(next);
    const allowedOrigin = new URL(origin).origin;
    if (parsed.origin !== allowedOrigin) return "/dashboard";

    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/dashboard";
  } catch {
    return "/dashboard";
  }
}
