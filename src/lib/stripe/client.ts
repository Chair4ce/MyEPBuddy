import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Returns a singleton Stripe.js instance for the browser. Returns null when the
 * publishable key is not configured so callers can fall back gracefully.
 */
export function getStripeClient(): Promise<Stripe | null> {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return Promise.resolve(null);
  }

  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }

  return stripePromise;
}
