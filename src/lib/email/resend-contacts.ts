import {
  getResendApiKey,
  getResendContactsApiKey,
  ResendSendError,
} from "@/lib/email/resend";

const CONTACTS_URL = "https://api.resend.com/contacts";

export function isMilEmail(email: string): boolean {
  return /\.mil$/i.test(email.trim());
}

export type SyncResendMarketingContactResult =
  | { status: "skipped"; reason: "no_key" | "no_email" | "mil" }
  | { status: "synced" };

/**
 * Keep Resend Broadcast contacts in lockstep with an explicit in-app choice.
 * Turning reminders off (optedIn false) sets unsubscribed true so scheduled
 * cycle mail stops. Turning them on sets unsubscribed false.
 * Does not run for legacy NULL — those contacts stay on the campaign until
 * they opt out. Skips .mil. No-ops when the API key is unset (local/dev).
 *
 * Create first, then PATCH only when the email already exists. PATCH-by-email
 * returns 404 for unknown addresses; probing with PATCH floods Resend's error
 * log for every new opt-in.
 */
export async function syncResendMarketingContact(params: {
  email: string | null | undefined;
  optedIn: boolean;
  resendContactsApiKey?: string | null;
}): Promise<SyncResendMarketingContactResult> {
  const email = params.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return { status: "skipped", reason: "no_email" };
  }
  if (isMilEmail(email)) {
    return { status: "skipped", reason: "mil" };
  }

  const resendApiKey =
    params.resendContactsApiKey !== undefined
      ? params.resendContactsApiKey
      : getResendContactsApiKey();
  if (!resendApiKey) {
    if (process.env.NODE_ENV === "production" && getResendApiKey()) {
      throw new ResendSendError(
        401,
        "RESEND_CONTACTS_API_KEY is required to update Broadcast contacts"
      );
    }
    return { status: "skipped", reason: "no_key" };
  }

  const unsubscribed = !params.optedIn;
  const created = await resendContactRequest(resendApiKey, CONTACTS_URL, "POST", {
    email,
    unsubscribed,
  });

  if (created.ok) {
    return { status: "synced" };
  }

  if (isExistingContactConflict(created.status, created.detail)) {
    const patched = await resendContactRequest(
      resendApiKey,
      `${CONTACTS_URL}/${encodeURIComponent(email)}`,
      "PATCH",
      { unsubscribed }
    );
    if (patched.ok) {
      return { status: "synced" };
    }
    throw new ResendSendError(patched.status, patched.detail);
  }

  throw new ResendSendError(created.status, created.detail);
}

function isExistingContactConflict(status: number, detail: string): boolean {
  if (status === 409) return true;
  if (status !== 422 && status !== 400) return false;
  return /already exists|already a contact/i.test(detail);
}

async function resendContactRequest(
  resendApiKey: string,
  url: string,
  method: "PATCH" | "POST",
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; detail: string }> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const detail = await response.text();
  return { ok: response.ok, status: response.status, detail };
}
