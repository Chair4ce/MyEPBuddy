import { createClient } from "@/lib/supabase/client";
import {
  clearPersistedManagedInviteToken,
  readPersistedManagedInviteToken,
} from "@/lib/managed-member-invite-params";

export type ConsumeManagedInviteResult = {
  success: boolean;
  emailMismatch?: boolean;
  memberName?: string | null;
  invitedEmail?: string | null;
  signupEmail?: string | null;
  error?: string;
};

/**
 * Consumes a persisted invite token after the invitee authenticates.
 * Safe to call multiple times — RPC is idempotent for the same user.
 */
export async function consumePersistedManagedInviteToken(): Promise<ConsumeManagedInviteResult | null> {
  const token = readPersistedManagedInviteToken();
  if (!token) return null;

  const supabase = createClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: { p_token: string }
    ) => Promise<{
      data: {
        success?: boolean;
        email_mismatch?: boolean;
        member_name?: string | null;
        invited_email?: string | null;
        signup_email?: string | null;
        error?: string;
        already_consumed?: boolean;
      } | null;
      error: { message?: string } | null;
    }>
  )("consume_managed_member_invite", { p_token: token });

  if (error) {
    console.error("Failed to consume managed invite token:", error);
    return { success: false, error: error.message || "Failed to consume invite" };
  }

  if (!data?.success) {
    return {
      success: false,
      error: data?.error || "Invite could not be applied",
    };
  }

  clearPersistedManagedInviteToken();

  return {
    success: true,
    emailMismatch: Boolean(data.email_mismatch),
    memberName: data.member_name ?? null,
    invitedEmail: data.invited_email ?? null,
    signupEmail: data.signup_email ?? null,
  };
}
