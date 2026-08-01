import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getStripe,
  grantCreditsFromStripe,
  isStripeEventProcessed,
  recordStripeEvent,
} from "@/lib/stripe/server";
import { creditsFromPaidAmount } from "@/lib/billing/purchase-quantity";

export const runtime = "nodejs";
// Stripe needs the raw, unparsed body for signature verification.
export const dynamic = "force-dynamic";

type ResolvedCredits =
  | { ok: true; credits: number }
  | { ok: false; reason: "retry" | "invalid" };

/**
 * Resolve pack credits from the paid Checkout Session.
 * Fail closed with retry if we cannot read line items — never grant from
 * stale session metadata after adjustable_quantity changes.
 */
async function resolvePurchasedCredits(
  session: Stripe.Checkout.Session,
): Promise<ResolvedCredits> {
  let lineItemQuantity: number | null = null;

  try {
    const lineItems = await getStripe().checkout.sessions.listLineItems(
      session.id,
      { limit: 1 },
    );
    lineItemQuantity = lineItems.data[0]?.quantity ?? null;
  } catch (error) {
    console.error(
      "[billing/webhook] Failed to list line items; will retry",
      error,
    );
    return { ok: false, reason: "retry" };
  }

  const credits = creditsFromPaidAmount({
    lineItemQuantity,
    amountSubtotalCents: session.amount_subtotal,
  });

  if (credits === null || credits <= 0) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, credits };
}

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

        if (!userId) {
          console.error(
            "[billing/webhook] Missing user_id metadata; acknowledging without grant",
            { eventId: event.id, metadata: session.metadata },
          );
          await recordStripeEvent(event);
          return NextResponse.json({ received: true, skipped: "invalid_metadata" });
        }

        if (session.payment_status !== "paid") {
          // Don't record yet: a later async_payment_succeeded may complete it.
          return NextResponse.json({ received: true, skipped: "unpaid" });
        }

        const resolved = await resolvePurchasedCredits(session);
        if (!resolved.ok) {
          if (resolved.reason === "retry") {
            // Transient Stripe API failure — 500 so Stripe retries.
            return NextResponse.json(
              { error: "Unable to resolve purchased quantity" },
              { status: 500 },
            );
          }
          console.error(
            "[billing/webhook] Unable to derive credits from paid session",
            {
              eventId: event.id,
              amountSubtotal: session.amount_subtotal,
              metadata: session.metadata,
            },
          );
          await recordStripeEvent(event);
          return NextResponse.json({ received: true, skipped: "invalid_quantity" });
        }

        // grant_credits is idempotent on stripe_event_id, so retries are safe.
        await grantCreditsFromStripe({
          userId,
          credits: resolved.credits,
          stripeEventId: event.id,
          stripeCheckoutSessionId: session.id,
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
