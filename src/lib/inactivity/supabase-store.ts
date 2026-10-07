import { deleteAccountData } from "@/lib/account-deletion-server";
import type { InactivityDueRow, InactivityStage, InactivityStore } from "@/lib/inactivity/run";
import { createAdminClient } from "@/lib/supabase/server";

type QueryError = { message: string } | null;

type Admin = ReturnType<typeof createAdminClient>;

function asRpc(admin: Admin) {
  return admin as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: QueryError }>;
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: QueryError }>;
      };
      select: (
        columns: string,
        options?: { count?: "exact"; head?: boolean }
      ) => {
        in: (column: string, values: string[]) => {
          eq: (column: string, value: string) => {
            gte: (
              column: string,
              value: string
            ) => Promise<{ count: number | null; error: QueryError }>;
          };
        };
      };
    };
  };
}

function mapDueRow(value: unknown): InactivityDueRow {
  const row = value as Record<string, unknown>;
  return {
    user_id: String(row.user_id),
    email: String(row.email ?? ""),
    activity_at: String(row.activity_at),
    due_stage: row.due_stage as InactivityStage,
    scheduled_suspend_at: String(row.scheduled_suspend_at),
    scheduled_delete_at: String(row.scheduled_delete_at),
    notice_60_sent_at: row.notice_60_sent_at ? String(row.notice_60_sent_at) : null,
    notice_30_sent_at: row.notice_30_sent_at ? String(row.notice_30_sent_at) : null,
    already_suspended: row.already_suspended === true,
    email_suppressed: row.email_suppressed === true,
    suspended_at: row.suspended_at ? String(row.suspended_at) : null,
  };
}

export function createSupabaseInactivityStore(admin: Admin = createAdminClient()): InactivityStore {
  const db = asRpc(admin);

  return {
    async cancelStale(nowIso) {
      const { data, error } = await db.rpc("inactivity_cancel_stale", { p_now: nowIso });
      if (error) throw new Error("Inactivity cancel failed");
      return typeof data === "number" ? data : 0;
    },

    async due(stage, limit, nowIso) {
      const { data, error } = await db.rpc("inactivity_due", {
        p_now: nowIso,
        p_limit: limit,
        p_stage: stage,
      });
      if (error) throw new Error("Inactivity selection failed");
      if (!Array.isArray(data)) return [];
      return data.map(mapDueRow);
    },

    async sentCount(sinceIso, types) {
      const { count, error } = await db
        .from("account_inactivity_notices")
        .select("id", { count: "exact", head: true })
        .in("notice_type", types)
        .eq("status", "sent")
        .gte("sent_at", sinceIso);
      if (error) throw new Error("Inactivity sent count failed");
      return count ?? 0;
    },

    async claim(row) {
      const { data, error } = await db.rpc("inactivity_claim_notice", {
        p_user_id: row.user_id,
        p_notice_type: row.due_stage,
        p_activity_anchor: row.activity_at,
        p_scheduled_suspend_at: row.scheduled_suspend_at,
      });
      if (error) throw new Error("Inactivity claim failed");
      return typeof data === "string" ? data : null;
    },

    async markSent(id, resendEmailId, nowIso) {
      const { error } = await db
        .from("account_inactivity_notices")
        .update({
          status: "sent",
          sent_at: nowIso,
          resend_email_id: resendEmailId,
          error: null,
        })
        .eq("id", id);
      if (error) throw new Error("Inactivity mark sent failed");
    },

    async markFailed(id, errorMessage) {
      const { error } = await db
        .from("account_inactivity_notices")
        .update({ status: "failed", error: errorMessage })
        .eq("id", id);
      if (error) throw new Error("Inactivity mark failed failed");
    },

    async markSkipped(id, reason) {
      const { error } = await db
        .from("account_inactivity_notices")
        .update({ status: "skipped", error: reason })
        .eq("id", id);
      if (error) throw new Error("Inactivity mark skipped failed");
    },

    async suspendUser(userId, atIso) {
      const { data: existing, error: readError } = await admin.auth.admin.getUserById(userId);
      if (readError || !existing.user) {
        throw new Error("Inactivity suspend could not read the auth user");
      }
      const appMetadata = {
        ...(existing.user.app_metadata ?? {}),
        inactivity_suspended_at: atIso,
      };
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: appMetadata,
      });
      if (authError) throw new Error("Inactivity suspend could not update auth metadata");

      const { error } = await admin
        .from("profiles")
        .update({ inactivity_suspended_at: atIso } as never)
        .eq("id", userId);
      if (error) throw new Error("Inactivity suspend could not update the profile");
    },

    async deleteUser(userId) {
      const result = await deleteAccountData(admin, userId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

export async function tryInactivityLock(admin: Admin = createAdminClient()): Promise<boolean> {
  const { data, error } = await asRpc(admin).rpc("inactivity_try_lock");
  if (error) throw new Error("Inactivity lock failed");
  return data === true;
}

export async function finishInactivityLock(admin: Admin = createAdminClient()): Promise<void> {
  const { error } = await asRpc(admin).rpc("inactivity_finish_lock");
  if (error) throw new Error("Inactivity unlock failed");
}
