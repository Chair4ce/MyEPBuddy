import type { Rank } from "@/types/database";

/**
 * Constrained people lookup.
 *
 * `profiles` is no longer world-readable (migration 203) — an authenticated user
 * can only SELECT profiles they already have a relationship with. Invite and
 * share UIs still need to resolve strangers, so they go through two SECURITY
 * DEFINER RPCs that return directory columns only:
 *
 * - `search_profile_by_email`   exact, case-insensitive, at most one row
 * - `search_profiles_directory` substring, min 3 chars, at most ten rows
 */

/** Structural shape shared by the browser and server Supabase clients. */
type RpcCapableClient = { rpc: unknown };

type RpcCall = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message?: string } | null }>;

/** Minimum characters before the directory search will return anything. Mirrors the SQL guard. */
export const PROFILE_SEARCH_MIN_QUERY_LENGTH = 3;

export interface DirectoryProfile {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
  afsc: string | null;
}

export interface EmailMatchProfile extends DirectoryProfile {
  unit: string | null;
}

function callRpc(supabase: RpcCapableClient): RpcCall {
  return (supabase.rpc as RpcCall).bind(supabase) as RpcCall;
}

/**
 * Resolve a single profile by exact email. Returns null when the address is not
 * a registered user (or the input is not an email).
 */
export async function searchProfileByEmail(
  supabase: RpcCapableClient,
  email: string
): Promise<EmailMatchProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }

  const { data, error } = await callRpc(supabase)("search_profile_by_email", {
    p_email: normalizedEmail,
  });

  if (error) {
    console.error("Profile email lookup failed:", error.message);
    return null;
  }

  const match = (data as EmailMatchProfile[] | null)?.[0];
  if (!match) return null;

  return { ...match, email: match.email || normalizedEmail };
}

/**
 * Substring search over name + email for people pickers. Returns an empty list
 * for queries shorter than {@link PROFILE_SEARCH_MIN_QUERY_LENGTH}.
 */
export async function searchProfilesDirectory(
  supabase: RpcCapableClient,
  query: string
): Promise<DirectoryProfile[]> {
  const trimmed = query.trim();
  if (trimmed.length < PROFILE_SEARCH_MIN_QUERY_LENGTH) {
    return [];
  }

  const { data, error } = await callRpc(supabase)("search_profiles_directory", {
    p_query: trimmed,
  });

  if (error) {
    throw new Error(error.message || "Profile search failed");
  }

  return (data as DirectoryProfile[] | null) ?? [];
}
