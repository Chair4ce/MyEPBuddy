import { requestManagedMemberInvite } from "@/lib/managed-member-invite-client";

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyManagedMemberInviteLink(params: {
  teamMemberId: string;
  recipientEmail: string;
}): Promise<{ ok: boolean; inviteUrl?: string; error?: string }> {
  const result = await requestManagedMemberInvite({
    ...params,
    sendEmail: false,
  });

  if (!result.inviteUrl) {
    return { ok: false, error: result.error || "Could not create invite link" };
  }

  const copied = await copyText(result.inviteUrl);
  return {
    ok: copied,
    inviteUrl: result.inviteUrl,
    error: copied ? undefined : "Invite link created, but clipboard copy failed",
  };
}

export async function resendManagedMemberInvite(params: {
  teamMemberId: string;
  recipientEmail: string;
}): Promise<{ ok: boolean; inviteUrl?: string; sent: boolean; error?: string }> {
  const result = await requestManagedMemberInvite({
    ...params,
    sendEmail: true,
  });

  if (result.sent) {
    return { ok: true, sent: true, inviteUrl: result.inviteUrl };
  }

  if (result.inviteUrl) {
    const copied = await copyText(result.inviteUrl);
    return {
      ok: true,
      sent: false,
      inviteUrl: result.inviteUrl,
      error: copied
        ? "Email couldn't be sent — invite link copied instead"
        : result.error || "Email couldn't be sent",
    };
  }

  return {
    ok: false,
    sent: false,
    error: result.error || "Failed to resend invite",
  };
}
