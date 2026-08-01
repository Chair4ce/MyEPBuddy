import { describe, expect, it } from "vitest";
import {
  creditsFromPaidAmount,
  parsePurchasePacks,
} from "@/lib/billing/purchase-quantity";
import {
  MAX_PURCHASE_PACKS,
  MIN_PURCHASE_PACKS,
  PURCHASE_CREDITS,
  PURCHASE_PRICE_CENTS,
} from "@/lib/billing/constants";

describe("parsePurchasePacks", () => {
  it("accepts integer pack counts in range", () => {
    expect(parsePurchasePacks(1)).toEqual({
      ok: true,
      packs: 1,
      credits: 100,
      priceUsd: 1,
    });
    expect(parsePurchasePacks(5)).toEqual({
      ok: true,
      packs: 5,
      credits: 500,
      priceUsd: 5,
    });
    expect(parsePurchasePacks(String(MAX_PURCHASE_PACKS))).toEqual({
      ok: true,
      packs: MAX_PURCHASE_PACKS,
      credits: MAX_PURCHASE_PACKS * PURCHASE_CREDITS,
      priceUsd: MAX_PURCHASE_PACKS,
    });
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(parsePurchasePacks(1.5).ok).toBe(false);
    expect(parsePurchasePacks(0).ok).toBe(false);
    expect(parsePurchasePacks(MIN_PURCHASE_PACKS - 1).ok).toBe(false);
    expect(parsePurchasePacks(MAX_PURCHASE_PACKS + 1).ok).toBe(false);
    expect(parsePurchasePacks("abc").ok).toBe(false);
    expect(parsePurchasePacks(null).ok).toBe(false);
    expect(parsePurchasePacks(undefined).ok).toBe(false);
  });
});

describe("creditsFromPaidAmount", () => {
  it("prefers line-item quantity", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: 3,
        amountSubtotalCents: 100,
      }),
    ).toBe(300);
  });

  it("uses amount_subtotal when line items are missing", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: null,
        amountSubtotalCents: 7 * PURCHASE_PRICE_CENTS,
      }),
    ).toBe(7 * PURCHASE_CREDITS);
  });

  it("ignores tax-like non-aligned totals and never trusts metadata", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: null,
        amountSubtotalCents: 108, // e.g. $1 + tax
      }),
    ).toBeNull();

    // Stale metadata must not be used even if present on the session object.
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: null,
        amountSubtotalCents: null,
      }),
    ).toBeNull();
  });

  it("rejects out-of-range quantities", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: MAX_PURCHASE_PACKS + 1,
        amountSubtotalCents: null,
      }),
    ).toBeNull();
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: MIN_PURCHASE_PACKS - 1,
        amountSubtotalCents: null,
      }),
    ).toBeNull();
  });

  it("accepts MAX pack boundary via quantity and subtotal", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: MAX_PURCHASE_PACKS,
        amountSubtotalCents: null,
      }),
    ).toBe(MAX_PURCHASE_PACKS * PURCHASE_CREDITS);

    expect(
      creditsFromPaidAmount({
        lineItemQuantity: null,
        amountSubtotalCents: MAX_PURCHASE_PACKS * PURCHASE_PRICE_CENTS,
      }),
    ).toBe(MAX_PURCHASE_PACKS * PURCHASE_CREDITS);
  });

  it("returns null when all inputs are invalid", () => {
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: undefined,
        amountSubtotalCents: undefined,
      }),
    ).toBeNull();
    expect(
      creditsFromPaidAmount({
        lineItemQuantity: 1.5,
        amountSubtotalCents: 50,
      }),
    ).toBeNull();
  });
});
