import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { isMilEmail, syncResendMarketingContact } from "@/lib/email/resend-contacts";
import type { MarketingEmailOptInSource } from "@/lib/marketing-email-opt-in";

const MAX_TIMESTAMP_SKEW_SEC = 5 * 60;

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

export type ResendListAction =
  | { kind: "ignore"; reason: string }
  | {
      kind: "preference";
      email: string;
      optedIn: boolean;
      /** Bounce/complaint: also mark the Resend contact unsubscribed. */
      syncContact: boolean;
    };

export function verifyResendWebhookSignature(params: {
  payload: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}): void {
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts)) {
    throw new Error("Invalid webhook timestamp");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SEC) {
    throw new Error("Webhook timestamp too old");
  }

  const secretB64 = params.secret.startsWith("whsec_")
    ? params.secret.slice(6)
    : params.secret;
  const key = Buffer.from(secretB64, "base64");
  const signed = `${params.id}.${params.timestamp}.${params.payload}`;
  const digest = createHmac("sha256", key).update(signed).digest("base64");
  const expected = Buffer.from(`v1,${digest}`);

  const candidates = params.signatureHeader.split(/\s+/).filter(Boolean);
  let matched = false;
  for (const candidate of candidates) {
    const given = Buffer.from(candidate);
    if (given.length !== expected.length) continue;
    if (timingSafeEqual(given, expected)) matched = true;
  }
  if (!matched) {
    throw new Error("Invalid webhook signature");
  }
}

export function parseResendWebhookEvent(payload: string): ResendWebhookEvent {
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid webhook payload");
  }
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string" || !type) {
    throw new Error("Invalid webhook payload");
  }
  const data = (parsed as { data?: unknown }).data;
  return {
    type,
    created_at:
      typeof (parsed as { created_at?: unknown }).created_at === "string"
        ? (parsed as { created_at: string }).created_at
        : undefined,
    data:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined,
  };
}

export function interpretResendWebhookEvent(
  event: ResendWebhookEvent
): ResendListAction {
  if (event.type === "contact.updated" || event.type === "contact.created") {
    const email = firstEmail(event.data?.email);
    if (!email) return { kind: "ignore", reason: "no_email" };
    if (isMilEmail(email)) return { kind: "ignore", reason: "mil" };
    return {
      kind: "preference",
      email,
      optedIn: event.data?.unsubscribed !== true,
      syncContact: false,
    };
  }

  if (event.type === "email.complained") {
    const email = firstEmail(event.data?.to);
    if (!email) return { kind: "ignore", reason: "no_email" };
    if (isMilEmail(email)) return { kind: "ignore", reason: "mil" };
    return { kind: "preference", email, optedIn: false, syncContact: true };
  }

  if (event.type === "email.bounced") {
    const bounce = event.data?.bounce;
    const bounceType =
      bounce && typeof bounce === "object"
        ? (bounce as { type?: unknown }).type
        : undefined;
    if (typeof bounceType === "string" && bounceType.toLowerCase() !== "permanent") {
      return { kind: "ignore", reason: "soft_bounce" };
    }
    const email = firstEmail(event.data?.to);
    if (!email) return { kind: "ignore", reason: "no_email" };
    if (isMilEmail(email)) return { kind: "ignore", reason: "mil" };
    return { kind: "preference", email, optedIn: false, syncContact: true };
  }

  return { kind: "ignore", reason: "unhandled_type" };
}

function firstEmail(value: unknown): string | null {
  if (typeof value === "string") {
    const email = value.trim().toLowerCase();
    return email.includes("@") ? email : null;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return firstEmail(value[0]);
  }
  return null;
}

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function applyResendListAction(
  action: ResendListAction,
  deps: {
    admin?: ReturnType<typeof createAdminClient>;
    syncContact?: typeof syncResendMarketingContact;
  } = {}
): Promise<{ status: "ignored" | "updated" | "unchanged" }> {
  if (action.kind === "ignore") {
    return { status: "ignored" };
  }

  const admin = deps.admin ?? createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, marketing_email_opt_in")
    .ilike("email", escapeIlikeExact(action.email))
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (action.syncContact) {
    const sync = deps.syncContact ?? syncResendMarketingContact;
    await sync({ email: action.email, optedIn: action.optedIn });
  }

  if (!profile) {
    return { status: "ignored" };
  }

  if (profile.marketing_email_opt_in === action.optedIn) {
    return { status: "unchanged" };
  }

  const source: MarketingEmailOptInSource = "resend";
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      marketing_email_opt_in: action.optedIn,
      marketing_email_opt_in_at: new Date().toISOString(),
      marketing_email_opt_in_source: source,
    } as never)
    .eq("id", profile.id);

  if (updateError) {
    throw updateError;
  }

  return { status: "updated" };
}
