import { buildInactivityNoticeEmail } from "@/lib/email/inactivity-notice";

export const dynamic = "force-dynamic";

/**
 * Local/dev preview of inactivity notices.
 * Public route — not linked from the product UI. Does not send mail.
 */
export default function InactivityNoticePreviewPage() {
  const activityAt = "2025-12-20T07:00:00.000Z";
  const suspendAt = "2026-12-20T07:00:00.000Z";
  const deleteAt = "2027-01-19T07:00:00.000Z";

  const previews = [
    {
      title: "60-day notice",
      email: buildInactivityNoticeEmail({
        kind: "notice_60",
        activityAt,
        suspendAt,
        deleteAt,
      }),
    },
    {
      title: "30-day notice",
      email: buildInactivityNoticeEmail({
        kind: "notice_30",
        activityAt,
        suspendAt,
        deleteAt,
      }),
    },
    {
      title: "Suspended",
      email: buildInactivityNoticeEmail({
        kind: "suspended",
        activityAt,
        suspendAt,
        deleteAt,
      }),
    },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8 text-[#e5e5e5]">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-white">Inactivity notice emails</h1>
          <p className="text-sm text-[#a3a3a3]">
            Transactional account mail. Sign in goes to the login page. No magic link and no unsubscribe link.
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
              className="block min-h-[640px] w-full border-0 bg-[#141414]"
            />
          </section>
        ))}
      </div>
    </main>
  );
}
