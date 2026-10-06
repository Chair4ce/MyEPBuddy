import { createAdminClient } from "@/lib/supabase/server";

type QueryError = { message: string } | null;

export type RestorableUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

export function isInactivitySuspended(user: RestorableUser | null | undefined): boolean {
  const raw = user?.app_metadata?.inactivity_suspended_at;
  return typeof raw === "string" && raw.length > 0;
}

type RestoreAdmin = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ error: QueryError }>;
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{
        data: { user: { app_metadata?: Record<string, unknown> } | null };
        error: QueryError;
      }>;
      updateUserById: (
        id: string,
        attributes: { app_metadata: Record<string, unknown> }
      ) => Promise<{ error: QueryError }>;
    };
  };
};

/**
 * Signing in, or any authenticated request while the suspension flag is
 * set, clears it and cancels open notices. Failures are swallowed so a
 * metadata hiccup cannot take down the request; the next request retries.
 */
export async function restoreSuspendedAccount(
  user: RestorableUser,
  admin?: RestoreAdmin
): Promise<boolean> {
  try {
    const client =
      admin ??
      (createAdminClient() as unknown as RestoreAdmin);

    const { error: cancelError } = await client.rpc("inactivity_cancel_user", {
      p_user_id: user.id,
      p_reason: "activity",
    });
    if (cancelError) return false;

    const { data, error: readError } = await client.auth.admin.getUserById(user.id);
    if (readError || !data.user) return false;

    const appMetadata = { ...(data.user.app_metadata ?? {}) };
    delete appMetadata.inactivity_suspended_at;
    const { error: writeError } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: appMetadata,
    });
    return !writeError;
  } catch {
    console.error("[inactivity] restore failed");
    return false;
  }
}
