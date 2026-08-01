/** Fallback when epb_config cannot be loaded */
export const DEFAULT_SIGNUP_TRIAL_CREDITS = 20;

/**
 * Token purchase unit: one pack = 100 tokens for $1 USD.
 * Checkout quantity is pack count (Stripe Price × quantity).
 */
export const PURCHASE_CREDITS = 100;
export const PURCHASE_PRICE_USD = 1;
export const PURCHASE_PRICE_CENTS = 100;

/** Minimum / maximum packs per checkout (abuse ceiling; buy again for more). */
export const MIN_PURCHASE_PACKS = 1;
export const MAX_PURCHASE_PACKS = 1000;

/**
 * Live Stripe Price ID for one pack (100 AI calls / $1 USD).
 * Set STRIPE_PRICE_100_CREDITS to this value in production, or your test-mode price locally.
 */
const LIVE_STARTER_PRICE_ID = "price_1TfRl1RmU7HJ5YzinnKdFWDl";

/** Live Stripe Product ID for the token pack. */
const LIVE_STARTER_PRODUCT_ID = "prod_UelHo41h4odIsL";

/** Display label for unit pricing */
export const PURCHASE_PACKAGE_LABEL = `$${PURCHASE_PRICE_USD} per ${PURCHASE_CREDITS} AI tokens`;

/** Credit ledger rows per page on the billing settings page */
export const LEDGER_PAGE_SIZE = 10;

/**
 * Roadmap (not implemented yet):
 * - Model A: metered pay-as-you-go with per-model pricing + up to 30% overhead
 * - Bulk credit packages with volume discounts
 * - Pro tier (e.g. unlimited default-model calls)
 * - Multi-model credit pricing via llm_model_catalog
 */
