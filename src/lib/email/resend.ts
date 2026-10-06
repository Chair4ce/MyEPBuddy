/** Shared Resend HTTP client for transactional emails. */

export type ResendEmailTag = {
  name: string;
  value: string;
};

export type SendResendEmailParams = {
  resendApiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  /** Resend Idempotency-Key. Same key within 24h returns the original send. */
  idempotencyKey?: string | null;
  tags?: ResendEmailTag[];
};

export type SendResendEmailResult = {
  id: string | null;
};

export class ResendSendError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`Email send failed: ${status} ${detail}`);
    this.name = "ResendSendError";
    this.status = status;
    this.detail = detail;
  }
}

/** Strip wrapping quotes Vercel/dashboard env UIs sometimes persist. */
export function normalizeEnvSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null;
  }
  return trimmed || null;
}

export async function sendResendEmail(
  params: SendResendEmailParams
): Promise<SendResendEmailResult> {
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

  if (params.tags && params.tags.length > 0) {
    payload.tags = params.tags;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.resendApiKey}`,
    "Content-Type": "application/json",
  };

  if (params.idempotencyKey) {
    const key = params.idempotencyKey.trim();
    if (key.length === 0 || key.length > 256 || /\s/.test(key)) {
      throw new Error("Invalid Resend idempotency key");
    }
    headers["Idempotency-Key"] = key;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ResendSendError(response.status, detail);
  }

  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const id = body && typeof body.id === "string" ? body.id : null;
  return { id };
}

/**
 * From address for transactional mail.
 * Must be on a domain verified in Resend (403 if not).
 */
export function getTransactionalFromEmail(): string | null {
  return (
    normalizeEnvSecret(process.env.EMAIL_FROM) ||
    normalizeEnvSecret(process.env.FEEDBACK_FROM_EMAIL) ||
    null
  );
}

export function getResendApiKey(): string | null {
  return normalizeEnvSecret(process.env.RESEND_API_KEY);
}

/**
 * Full-access key for Contacts (Broadcast unsub). Sending-access keys
 * return 401 restricted_api_key on PATCH /contacts.
 */
export function getResendContactsApiKey(): string | null {
  return normalizeEnvSecret(process.env.RESEND_CONTACTS_API_KEY);
}

/** Svix signing secret from the Resend webhook endpoint page (`whsec_…`). */
export function getResendWebhookSecret(): string | null {
  return normalizeEnvSecret(process.env.RESEND_WEBHOOK_SECRET);
}
