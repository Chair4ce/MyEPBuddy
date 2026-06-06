/** One-time trial grant for default-key AI usage */
export const TRIAL_CREDITS = 100;

/** Starter purchase package */
export const PURCHASE_CREDITS = 100;
export const PURCHASE_PRICE_USD = 1;
export const PURCHASE_PRICE_CENTS = 100;

/**
 * Live Stripe Price ID for the starter package (100 AI calls / $1 USD).
 * Set STRIPE_PRICE_100_CREDITS to this value in production, or your test-mode price locally.
 */
export const LIVE_STARTER_PRICE_ID = "price_1TfRl1RmU7HJ5YzinnKdFWDl";

/** Live Stripe Product ID for the starter package. */
export const LIVE_STARTER_PRODUCT_ID = "prod_UelHo41h4odIsL";

/** Display label for the starter package */
export const PURCHASE_PACKAGE_LABEL = `$${PURCHASE_PRICE_USD} for ${PURCHASE_CREDITS} AI calls`;

/** Credit ledger rows per page on the billing settings page */
export const LEDGER_PAGE_SIZE = 10;

/**
 * Roadmap (not implemented yet):
 * - Model A: metered pay-as-you-go with per-model pricing + up to 30% overhead
 * - Bulk credit packages with volume discounts
 * - Pro tier (e.g. unlimited default-model calls)
 * - Multi-model credit pricing via llm_model_catalog
 */
