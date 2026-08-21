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

/**
 * Resend → MyEPBuddy list sync.
 * Dashboard URL to register: https://myepbuddy.com/api/webhooks/resend
 * Events: contact.updated, contact.created, email.bounced, email.complained
 */
export async function POST(request: NextRequest) {
  const secret = getResendWebhookSecret();
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
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
    console.error("[webhooks/resend] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = parseResendWebhookEvent(payload);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const action = interpretResendWebhookEvent(event);
    const result = await applyResendListAction(action);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[webhooks/resend] Failed to apply event:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
