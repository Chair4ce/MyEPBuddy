import { NextRequest, NextResponse } from "next/server";
import { getResendWebhookSecret } from "@/lib/email/resend";
import {
  applyResendListAction,
  interpretResendWebhookEvent,
  parseResendWebhookEvent,
  verifyResendWebhookSignature,
} from "@/lib/email/resend-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookLogMeta(request: NextRequest) {
  return {
    host: request.headers.get("host"),
    svixId: request.headers.get("svix-id"),
  };
}

/**
 * Resend → MyEPBuddy list sync.
 * Dashboard URL to register: https://www.myepbuddy.com/api/webhooks/resend
 * (apex myepbuddy.com 307s to www; Resend will not follow that POST).
 * Events: contact.updated, contact.created, email.bounced, email.complained
 *
 * GET is a health probe (browser / dashboard). Resend delivers via POST.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: "resend",
      /** Apex myepbuddy.com 307s to www; Resend treats that POST as a failed attempt. */
      url: "https://www.myepbuddy.com/api/webhooks/resend",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const meta = webhookLogMeta(request);
  const secret = getResendWebhookSecret();
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET is not configured", meta);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    console.error("[webhooks/resend] Missing signature headers", meta);
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const payload = await request.text();
  try {
    verifyResendWebhookSignature({
      payload,
      id,
      timestamp,
      signatureHeader: signature,
      secret,
    });
  } catch (error) {
    console.error("[webhooks/resend] Signature verification failed:", error, meta);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = parseResendWebhookEvent(payload);
  } catch {
    console.error("[webhooks/resend] Invalid payload", meta);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const action = interpretResendWebhookEvent(event);
    const result = await applyResendListAction(action);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[webhooks/resend] Failed to apply event:", error, meta);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
