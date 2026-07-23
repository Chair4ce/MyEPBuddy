export type ManagedMemberInviteResult = {
  sent: boolean;
  variant?: "new_user" | "existing_user";
  error?: string;
};

/**
 * Fire-and-forget friendly: callers should not block member creation on email failure.
 */
export async function requestManagedMemberInvite(params: {
  teamMemberId: string;
  recipientEmail: string;
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
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      variant?: "new_user" | "existing_user";
    };

    if (!response.ok) {
      return {
        sent: false,
        error: data.error || "Failed to send invite email",
      };
    }

    return { sent: true, variant: data.variant };
  } catch (error) {
    console.error("Managed member invite request failed:", error);
    return { sent: false, error: "Failed to send invite email" };
  }
}
