import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { PURCHASE_CREDITS } from "@/lib/billing/constants";
import { getValidatedCreditsPriceId } from "@/lib/stripe/validate-price";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (process.env.NODE_ENV === "production" && !secretKey.startsWith("sk_live_")) {
    throw new Error("Production requires STRIPE_SECRET_KEY to be a live key (sk_live_...)");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }

  return stripeClient;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: { stripe_customer_id: string } | null; error: unknown }>;
        };
      };
    };
  })
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, string>) => Promise<{ error: { code?: string; message: string } | null }>;
    };
  }).from("stripe_customers").insert({
    user_id: userId,
    stripe_customer_id: customer.id,
  });

  if (error) {
    throw new Error(`Failed to save Stripe customer: ${error.message}`);
  }

  return customer.id;
}

export async function createCreditsCheckoutSession(params: {
  userId: string;
  email: string;
}): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(params.userId, params.email);
  const priceId = await getValidatedCreditsPriceId(stripe);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${getAppUrl()}/settings/billing?checkout=success`,
    cancel_url: `${getAppUrl()}/settings/billing?checkout=cancelled`,
    metadata: {
      user_id: params.userId,
      credits: String(PURCHASE_CREDITS),
    },
    payment_intent_data: {
      metadata: {
        user_id: params.userId,
        credits: String(PURCHASE_CREDITS),
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session missing URL");
  }

  return session.url;
}

export async function createBillingPortalSession(
  userId: string,
): Promise<string> {
  const supabase = createAdminClient();
  const { data: customerRow } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: { stripe_customer_id: string } | null; error: unknown }>;
        };
      };
    };
  })
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!customerRow?.stripe_customer_id) {
    throw new Error("No billing account found. Make a purchase first.");
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerRow.stripe_customer_id,
    return_url: `${getAppUrl()}/settings/billing`,
  });

  return session.url;
}

export async function grantCreditsFromStripe(params: {
  userId: string;
  credits: number;
  stripeEventId: string;
}): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await (supabase.rpc as Function)(
    "grant_credits",
    {
      p_user_id: params.userId,
      p_amount: params.credits,
      p_type: "purchase",
      p_stripe_event_id: params.stripeEventId,
      p_description: `Purchased ${params.credits} AI calls`,
    },
  ) as { data: number | null; error: { message: string } | null };

  if (error) {
    throw new Error(`grant_credits failed: ${error.message}`);
  }

  return data as number;
}

/**
 * Returns true if this Stripe event has already been fully processed.
 * Used as a fast-path idempotency guard at the top of the webhook.
 */
export async function isStripeEventProcessed(
  eventId: string,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    // Fail open: if we can't check, let processing continue.
    // The grant_credits RPC is itself idempotent on stripe_event_id.
    console.error("[stripe] isStripeEventProcessed check failed:", error.message);
    return false;
  }

  return data !== null;
}

/**
 * Records a Stripe event as processed (audit log + secondary idempotency guard).
 * Best-effort: a duplicate insert is treated as success. Call AFTER the event's
 * side effects have completed so a transient failure mid-processing does not
 * permanently mark the event as handled.
 */
export async function recordStripeEvent(event: Stripe.Event): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, string>) => Promise<{ error: { code?: string; message: string } | null }>;
    };
  }).from("stripe_events").insert({
    id: event.id,
    event_type: event.type,
  });

  if (error && error.code !== "23505") {
    console.error("[stripe] Failed to record stripe event:", error.message);
  }
}
