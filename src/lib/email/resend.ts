/** Shared Resend HTTP client for transactional emails. */

export type SendResendEmailParams = {
  resendApiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
};

export async function sendResendEmail(
  params: SendResendEmailParams
): Promise<void> {
  const payload: Record<string, unknown> = {
    from: params.from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
  };

  if (params.replyTo) {
    payload.reply_to = params.replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email send failed: ${response.status} ${detail}`);
  }
}

export function getTransactionalFromEmail(): string | null {
  return (
    process.env.EMAIL_FROM ||
    process.env.FEEDBACK_FROM_EMAIL ||
    null
  );
}
