import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getStripe,
  grantCreditsFromStripe,
  isStripeEventProcessed,
  recordStripeEvent,
} from "@/lib/stripe/server";
import { PURCHASE_CREDITS } from "@/lib/billing/constants";

export const runtime = "nodejs";
// Stripe needs the raw, unparsed body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("[billing/webhook] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    // Fast-path idempotency: skip events we've already fully processed.
    if (await isStripeEventProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const parsedCredits = parseInt(session.metadata?.credits ?? "", 10);
        const credits = Number.isNaN(parsedCredits)
          ? PURCHASE_CREDITS
          : parsedCredits;

        if (!userId || credits <= 0) {
          // Acknowledge so Stripe stops retrying a malformed event we can't act on.
          console.error(
            "[billing/webhook] Missing/invalid session metadata; acknowledging without grant",
            { eventId: event.id, metadata: session.metadata },
          );
          await recordStripeEvent(event);
          return NextResponse.json({ received: true, skipped: "invalid_metadata" });
        }

        if (session.payment_status !== "paid") {
          // Don't record yet: a later async_payment_succeeded may complete it.
          return NextResponse.json({ received: true, skipped: "unpaid" });
        }

        // grant_credits is idempotent on stripe_event_id, so retries are safe.
        await grantCreditsFromStripe({
          userId,
          credits,
          stripeEventId: event.id,
        });
        break;
      }
      default:
        // Unhandled event types are acknowledged and recorded as seen.
        break;
    }

    // Record only AFTER successful processing so a transient failure above
    // results in a 500 -> Stripe retry -> reprocessing (not a silent skip).
    await recordStripeEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing/webhook] Processing error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
