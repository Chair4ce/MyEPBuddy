import { headers } from "next/headers";
import { buildManagedMemberInviteEmail } from "@/lib/email/managed-member-invite";

export const dynamic = "force-dynamic";

async function getPreviewSiteUrl(): Promise<string> {
  // Prefer the host the user is actually viewing so Accept Invitation stays local.
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto =
    headerStore.get("x-forwarded-proto") ||
    (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/**
 * Local/dev preview of the managed-account invite email.
 * Public route — not linked from the product UI.
 */
export default async function ManagedInviteEmailPreviewPage() {
  const siteUrl = await getPreviewSiteUrl();

  const newUser = buildManagedMemberInviteEmail({
    siteUrl,
    recipientEmail: "airman.jones@example.mil",
    recipientName: "Amn Jones",
    supervisorDisplayName: "MSgt Rivera",
    teamMemberId: "preview-team-member",
    inviteToken: "preview-invite-token",
    variant: "new_user",
  });

  const existingUser = buildManagedMemberInviteEmail({
    siteUrl,
    recipientEmail: "ssgt.lee@example.mil",
    recipientName: "SSgt Lee",
    supervisorDisplayName: "MSgt Rivera",
    teamMemberId: "preview-team-member-2",
    inviteToken: "preview-invite-token-2",
    variant: "existing_user",
  });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-white">
            Managed account invite email
          </h1>
          <p className="text-sm text-[#a3a3a3]">
            Preview only. Use Accept Invitation to exercise the real signup flow.
          </p>
        </header>

        <section className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111]">
          <div className="border-b border-[#2a2a2a] px-4 py-3 text-sm text-[#a3a3a3]">
            <p className="font-medium text-white">New user</p>
            <p>Subject: {newUser.subject}</p>
          </div>
          <div
            className="bg-[#141414]"
            dangerouslySetInnerHTML={{ __html: newUser.html }}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111]">
          <div className="border-b border-[#2a2a2a] px-4 py-3 text-sm text-[#a3a3a3]">
            <p className="font-medium text-white">Existing user</p>
            <p>Subject: {existingUser.subject}</p>
          </div>
          <div
            className="bg-[#141414]"
            dangerouslySetInnerHTML={{ __html: existingUser.html }}
          />
        </section>
      </div>
    </main>
  );
}
