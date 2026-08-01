export type ManagedMemberInviteResult = {
  /** True when the invite email was delivered via Resend. */
  sent: boolean;
  /** Always set when a token was issued (even if email was not sent). */
  inviteUrl?: string;
  variant?: "new_user" | "existing_user";
  code?: "email_not_configured" | "email_send_failed" | string;
  error?: string;
};

/**
 * Fire-and-forget friendly: callers should not block member creation on email failure.
 * A successful response may still have sent=false when email is not configured —
 * in that case inviteUrl is available for the supervisor to copy/share.
 */
export async function requestManagedMemberInvite(params: {
  teamMemberId: string;
  recipientEmail: string;
  /** When false, issue/return the invite URL without sending email. Default true. */
  sendEmail?: boolean;
}): Promise<ManagedMemberInviteResult> {
  const email = params.recipientEmail.trim().toLowerCase();
  if (!params.teamMemberId || !email || !email.includes("@")) {
    return { sent: false, error: "Missing invite email" };
  }

  try {
    const response = await fetch("/api/team/invite-managed-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamMemberId: params.teamMemberId,
        recipientEmail: email,
        sendEmail: params.sendEmail !== false,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      emailSent?: boolean;
      inviteUrl?: string;
      variant?: "new_user" | "existing_user";
      code?: string;
    };

    if (!response.ok) {
      return {
        sent: false,
        error: data.error || "Failed to create invite",
      };
    }

    const emailSent = data.emailSent === true;
    return {
      sent: emailSent,
      inviteUrl: data.inviteUrl,
      variant: data.variant,
      code: data.code,
      error: emailSent ? undefined : data.error,
    };
  } catch (error) {
    console.error("Managed member invite request failed:", error);
    return { sent: false, error: "Failed to create invite" };
  }
}
