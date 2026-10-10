"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  AwardShellShare,
  DecorationShellShare,
  EPBShellShare,
  Profile,
} from "@/types/database";

type ShareActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type AwardShareRow = AwardShellShare & { shared_with_profile?: Profile };
type DecorationShareRow = DecorationShellShare & { shared_with_profile?: Profile };
type EpbShareRow = EPBShellShare & { shared_with_profile?: Profile };

function insertedShareId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  const id = data.id;
  return typeof id === "string" ? id : null;
}

async function requireAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

export async function shareAwardShellWithUser(
  shellId: string,
  sharedWithId: string,
): Promise<ShareActionResult<AwardShareRow>> {
  const { supabase, user } = await requireAuthedClient();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const inserted = await supabase
    .from("award_shell_shares")
    .insert({
      shell_id: shellId,
      owner_id: user.id,
      share_type: "user",
      shared_with_id: sharedWithId,
    } as never)
    .select("id")
    .single();

  const shareId = insertedShareId(inserted.data);
  if (inserted.error || !shareId) {
    return { ok: false, error: inserted.error?.message ?? "Failed to share" };
  }

  // A second statement: can_view_profile is STABLE, so it cannot see the
  // share row inside the INSERT that created it. The embed would come back null.
  const { data, error } = await supabase
    .from("award_shell_shares")
    .select(`
      *,
      shared_with_profile:profiles!award_shell_shares_shared_with_id_fkey(
        id, full_name, rank, afsc, email
      )
    `)
    .eq("id", shareId)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as AwardShareRow };
}

export async function shareDecorationShellWithUser(
  shellId: string,
  sharedWithId: string,
): Promise<ShareActionResult<DecorationShareRow>> {
  const { supabase, user } = await requireAuthedClient();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const inserted = await supabase
    .from("decoration_shell_shares")
    .insert({
      shell_id: shellId,
      owner_id: user.id,
      share_type: "user",
      shared_with_id: sharedWithId,
    } as never)
    .select("id")
    .single();

  const shareId = insertedShareId(inserted.data);
  if (inserted.error || !shareId) {
    return { ok: false, error: inserted.error?.message ?? "Failed to share" };
  }

  const { data, error } = await supabase
    .from("decoration_shell_shares")
    .select(`
      *,
      shared_with_profile:profiles!decoration_shell_shares_shared_with_id_fkey(
        id, full_name, rank, afsc, email
      )
    `)
    .eq("id", shareId)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as DecorationShareRow };
}

export async function shareEpbShellWithUser(
  shellId: string,
  sharedWithId: string,
): Promise<ShareActionResult<EpbShareRow>> {
  const { supabase, user } = await requireAuthedClient();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const inserted = await supabase
    .from("epb_shell_shares")
    .insert({
      shell_id: shellId,
      owner_id: user.id,
      share_type: "user",
      shared_with_id: sharedWithId,
    } as never)
    .select("id")
    .single();

  const shareId = insertedShareId(inserted.data);
  if (inserted.error || !shareId) {
    return { ok: false, error: inserted.error?.message ?? "Failed to share" };
  }

  const { data, error } = await supabase
    .from("epb_shell_shares")
    .select(`
      *,
      shared_with_profile:profiles!epb_shell_shares_shared_with_id_fkey(
        id, full_name, rank, afsc, email
      )
    `)
    .eq("id", shareId)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as EpbShareRow };
}
