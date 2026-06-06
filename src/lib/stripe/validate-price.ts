import type Stripe from "stripe";
import { PURCHASE_PRICE_CENTS } from "@/lib/billing/constants";

export type StripeKeyMode = "live" | "test";

export function getStripeKeyMode(secretKey: string): StripeKeyMode {
  if (secretKey.startsWith("sk_live_")) return "live";
  if (secretKey.startsWith("sk_test_")) return "test";
  throw new Error("STRIPE_SECRET_KEY must start with sk_live_ or sk_test_");
}

export function getConfiguredCreditsPriceId(): string {
  const priceId =
    process.env.STRIPE_PRICE_100_CREDITS ||
    process.env.STRIPE_PRICE_150_CREDITS ||
    process.env.STRIPE_STARTER_PRICE_ID;

  if (!priceId?.startsWith("price_")) {
    throw new Error(
      "STRIPE_PRICE_100_CREDITS (or STRIPE_PRICE_150_CREDITS / STRIPE_STARTER_PRICE_ID) must be set to a valid Stripe price ID",
    );
  }

  return priceId;
}

/** Ensures the configured price matches the $1 starter package and Stripe key mode. */
export async function validateCreditsPriceOrThrow(
  stripe: Stripe,
  priceId: string,
): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const expectedMode = getStripeKeyMode(secretKey);
  const price = await stripe.prices.retrieve(priceId);

  if (price.livemode !== (expectedMode === "live")) {
    throw new Error(
      `Stripe price mode mismatch: STRIPE_SECRET_KEY is ${expectedMode} but price ${priceId} is ${price.livemode ? "live" : "test"}`,
    );
  }

  if (!price.active) {
    throw new Error(`Stripe price ${priceId} is inactive`);
  }

  if (price.recurring !== null) {
    throw new Error(`Stripe price ${priceId} must be a one-time price`);
  }

  if (price.currency !== "usd") {
    throw new Error(`Stripe price ${priceId} must use USD`);
  }

  if (price.unit_amount !== PURCHASE_PRICE_CENTS) {
    throw new Error(
      `Stripe price ${priceId} must be $${PURCHASE_PRICE_CENTS / 100} USD (${PURCHASE_PRICE_CENTS} cents), got ${price.unit_amount ?? "custom"} cents`,
    );
  }
}

let cachedValidatedPriceId: { id: string; validatedAt: number } | null = null;
const VALIDATION_CACHE_MS = 5 * 60 * 1000;

export async function getValidatedCreditsPriceId(
  stripe: Stripe,
): Promise<string> {
  const priceId = getConfiguredCreditsPriceId();

  if (
    cachedValidatedPriceId?.id === priceId &&
    Date.now() - cachedValidatedPriceId.validatedAt < VALIDATION_CACHE_MS
  ) {
    return priceId;
  }

  await validateCreditsPriceOrThrow(stripe, priceId);
  cachedValidatedPriceId = { id: priceId, validatedAt: Date.now() };
  return priceId;
}
