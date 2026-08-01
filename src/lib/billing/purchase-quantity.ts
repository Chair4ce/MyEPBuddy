import {
  MAX_PURCHASE_PACKS,
  MIN_PURCHASE_PACKS,
  PURCHASE_CREDITS,
  PURCHASE_PRICE_CENTS,
  PURCHASE_PRICE_USD,
} from "@/lib/billing/constants";

export type PurchasePacksResult =
  | { ok: true; packs: number; credits: number; priceUsd: number }
  | { ok: false; error: string };

/**
 * Validates pack count for token checkout. One pack = PURCHASE_CREDITS tokens
 * for PURCHASE_PRICE_USD. Rejects non-integers and out-of-range values.
 */
export function parsePurchasePacks(raw: unknown): PurchasePacksResult {
  const packs =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;

  if (!Number.isInteger(packs)) {
    return { ok: false, error: "Quantity must be a whole number of packs." };
  }

  if (packs < MIN_PURCHASE_PACKS || packs > MAX_PURCHASE_PACKS) {
    return {
      ok: false,
      error: `Quantity must be between ${MIN_PURCHASE_PACKS} and ${MAX_PURCHASE_PACKS} packs (${PURCHASE_CREDITS} tokens each).`,
    };
  }

  return {
    ok: true,
    packs,
    credits: packs * PURCHASE_CREDITS,
    priceUsd: packs * PURCHASE_PRICE_USD,
  };
}

/** Tokens for a validated pack count (assumes packs already validated). */
export function creditsForPacks(packs: number): number {
  return packs * PURCHASE_CREDITS;
}

/**
 * Derive granted credits from the finalized Checkout line item.
 * Prefer quantity (survives adjustable_quantity). Fall back only to
 * amount_subtotal (pre-tax). Never trust session metadata — it can be stale
 * if the buyer changed quantity inside Stripe Checkout.
 */
export function creditsFromPaidAmount(params: {
  lineItemQuantity?: number | null;
  /** Pre-tax subtotal in cents (session.amount_subtotal). */
  amountSubtotalCents?: number | null;
}): number | null {
  const { lineItemQuantity, amountSubtotalCents } = params;

  if (
    typeof lineItemQuantity === "number" &&
    Number.isInteger(lineItemQuantity) &&
    lineItemQuantity >= MIN_PURCHASE_PACKS &&
    lineItemQuantity <= MAX_PURCHASE_PACKS
  ) {
    return lineItemQuantity * PURCHASE_CREDITS;
  }

  if (
    typeof amountSubtotalCents === "number" &&
    amountSubtotalCents > 0 &&
    amountSubtotalCents % PURCHASE_PRICE_CENTS === 0
  ) {
    const packs = amountSubtotalCents / PURCHASE_PRICE_CENTS;
    if (
      Number.isInteger(packs) &&
      packs >= MIN_PURCHASE_PACKS &&
      packs <= MAX_PURCHASE_PACKS
    ) {
      return packs * PURCHASE_CREDITS;
    }
  }

  return null;
}
