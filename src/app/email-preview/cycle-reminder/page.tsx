import { headers } from "next/headers";
import { buildCycleReminderEmail } from "@/lib/email/cycle-reminder";

export const dynamic = "force-dynamic";

async function getPreviewSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto =
    headerStore.get("x-forwarded-proto") ||
    (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/**
 * Local/dev preview of SCOD cycle-reminder broadcasts.
 * Public route — not linked from the product UI.
 */
export default async function CycleReminderEmailPreviewPage() {
  const siteUrl = await getPreviewSiteUrl();
  const supervisor = buildCycleReminderEmail({
    siteUrl,
    rank: "TSgt",
    closeoutDateLabel: "30 November",
    send: "supervisor_soon",
    campaign: "scod-tsgt-preview",
  });
  const chief = buildCycleReminderEmail({
    siteUrl,
    rank: "TSgt",
    closeoutDateLabel: "30 November",
    send: "chief_soon",
    campaign: "scod-tsgt-preview",
  });
  const catchup = buildCycleReminderEmail({
    siteUrl,
    rank: "MSgt",
    closeoutDateLabel: "30 September",
    send: "catchup",
    campaign: "scod-msgt-preview",
  });

  const previews = [
    { title: "Normal · 65 days (due to supervisor in 5 days)", email: supervisor },
    { title: "Normal · 45 days (due to chief in 15 days)", email: chief },
    { title: "MSgt catch-up · out of window", email: catchup },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-white">
            EPB cycle reminder email
          </h1>
          <p className="text-sm text-[#a3a3a3]">
            Official MyEPBuddy chrome. Paste the HTML into Resend Broadcasts.
            Generate my EPB goes to login, then Entries.
          </p>
        </header>

        {previews.map((preview) => (
          <section
            key={preview.title}
            className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111]"
          >
            <div className="border-b border-[#2a2a2a] px-4 py-3 text-sm text-[#a3a3a3]">
              <p className="font-medium text-white">{preview.title}</p>
              <p>Subject: {preview.email.subject}</p>
              <p className="break-all">CTA: {preview.email.ctaUrl}</p>
            </div>
            <iframe
              title={preview.title}
              srcDoc={preview.email.html}
              sandbox=""
              className="block w-full min-h-[560px] border-0 bg-[#141414]"
            />
          </section>
        ))}
      </div>
    </main>
  );
}
