import {
  LIVE_STARTER_PRICE_ID,
  LIVE_STARTER_PRODUCT_ID,
} from "@/lib/billing/constants";
import { getConfiguredCreditsPriceId } from "@/lib/stripe/validate-price";

/** Stripe metadata key shared with PeriDocs. Values are exact and lowercase. */
export const STRIPE_APP_METADATA_KEY = "app";

export const MYEPBUDDY_STRIPE_APP = "myepbuddy";
export const PERIDOCS_STRIPE_APP = "peridocs";

export type StripeAppClassification =
  | { kind: "own" }
  | { kind: "foreign"; app: typeof PERIDOCS_STRIPE_APP }
  | { kind: "unmarked" }
  | { kind: "unknown_marker"; app: string };

/**
 * Classify Checkout Session metadata. Only an explicit other-app value is
 * foreign. Missing markers and unrecognized values stay on the price check
 * so legacy MyEPBuddy events and unrelated event shapes are not dropped.
 */
export function classifyStripeAppMetadata(
  metadata: { [key: string]: string } | null | undefined,
): StripeAppClassification {
  const raw = metadata?.[STRIPE_APP_METADATA_KEY];
  if (typeof raw !== "string" || raw.length === 0) {
    return { kind: "unmarked" };
  }
  if (raw === MYEPBUDDY_STRIPE_APP) {
    return { kind: "own" };
  }
  if (raw === PERIDOCS_STRIPE_APP) {
    return { kind: "foreign", app: PERIDOCS_STRIPE_APP };
  }
  return { kind: "unknown_marker", app: raw };
}

/** Configured pack price, or null when billing env is absent. */
export function readConfiguredCreditsPriceId(): string | null {
  try {
    return getConfiguredCreditsPriceId();
  } catch {
    return null;
  }
}

/**
 * True when the paid line item is this app's pack price.
 * A user id or email is not ownership proof. Accept the configured price id,
 * or the canonical live price when its product id matches.
 */
export function isMyEpBuddyCreditsPrice(input: {
  priceId: string | null;
  productId: string | null;
  configuredPriceId: string | null;
}): boolean {
  const { priceId, productId, configuredPriceId } = input;
  if (!priceId) return false;
  if (configuredPriceId && priceId === configuredPriceId) return true;
  return (
    priceId === LIVE_STARTER_PRICE_ID && productId === LIVE_STARTER_PRODUCT_ID
  );
}
