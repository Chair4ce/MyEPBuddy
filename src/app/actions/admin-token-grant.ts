"use server";

import { getAdminApiUser } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminGrantCreditsResult,
  AdminGrantSearchUser,
} from "@/lib/admin/token-grant";

type GrantActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function searchAdminGrantUsers(
  query: string,
): Promise<GrantActionResult<AdminGrantSearchUser[]>> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, data: [] };
  }

  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as Function)("admin_search_users", {
    p_query: trimmed,
    p_limit: 10,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: (data ?? []) as AdminGrantSearchUser[] };
}

export async function getAdminGrantTargetCount(): Promise<
  GrantActionResult<number>
> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as Function)("admin_grant_target_count");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: (data as number | null) ?? 0 };
}

export async function grantAdminCredits(params: {
  userIds: string[];
  amount: number;
  note: string | null;
}): Promise<GrantActionResult<AdminGrantCreditsResult>> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as Function)("admin_grant_credits", {
    p_user_ids: params.userIds,
    p_amount: params.amount,
    p_note: params.note,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as AdminGrantCreditsResult };
}

export async function grantAdminCreditsToAll(params: {
  amount: number;
  note: string | null;
}): Promise<GrantActionResult<AdminGrantCreditsResult>> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as Function)("admin_grant_credits_all", {
    p_amount: params.amount,
    p_note: params.note,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as AdminGrantCreditsResult };
}
