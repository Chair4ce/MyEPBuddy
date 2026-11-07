import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PURCHASE_PACKS,
  MIN_PURCHASE_PACKS,
  PURCHASE_CREDITS,
} from "@/lib/billing/constants";
import {
  PURCHASE_CAMPAIGN_METADATA_KEY,
  PURCHASE_CAMPAIGN_TZ_METADATA_KEY,
} from "@/lib/billing/purchase-campaign";

const PRICE_ID = "price_test_myepbuddy";
const USER_ID = "user_123";
const EMAIL = "buyer@example.com";
const CAMPAIGN = "founders-week";
const TIME_ZONE = "America/Phoenix";

const h = vi.hoisted(() => ({
  customer: { stripe_customer_id: "cus_existing" } as {
    stripe_customer_id: string;
  } | null,
  sessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  pricesRetrieve: vi.fn(),
}));

vi.mock("stripe", () => {
  class Stripe {
    checkout = { sessions: { create: h.sessionsCreate } };
    customers = { create: h.customersCreate };
    prices = { retrieve: h.pricesRetrieve };
  }
  return { default: Stripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.customer, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/billing/purchase-campaign-server", () => ({
  resolveCheckoutCampaignSlug: async () => CAMPAIGN,
}));

import {
  createCreditsCheckoutSession,
  createEmbeddedCreditsCheckoutSession,
} from "@/lib/stripe/server";

function expectedMetadata(packs: number) {
  return {
    app: "myepbuddy",
    user_id: USER_ID,
    packs: String(packs),
    credits: String(packs * PURCHASE_CREDITS),
    [PURCHASE_CAMPAIGN_METADATA_KEY]: CAMPAIGN,
    [PURCHASE_CAMPAIGN_TZ_METADATA_KEY]: TIME_ZONE,
  };
}

describe("credits checkout app marker", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_myepbuddy";
    process.env.STRIPE_PRICE_100_CREDITS = PRICE_ID;
    delete process.env.STRIPE_PRICE_150_CREDITS;
    delete process.env.STRIPE_STARTER_PRICE_ID;
    h.customer = { stripe_customer_id: "cus_existing" };
    h.sessionsCreate.mockReset();
    h.sessionsCreate.mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.test/c/cs_test",
      client_secret: "cs_test_secret",
    });
    h.customersCreate.mockReset();
    h.customersCreate.mockResolvedValue({ id: "cus_new" });
    h.pricesRetrieve.mockReset();
    h.pricesRetrieve.mockResolvedValue({
      id: PRICE_ID,
      livemode: false,
      active: true,
      recurring: null,
      currency: "usd",
      unit_amount: 100,
    });
  });

  it("stamps hosted Checkout session, PaymentIntent, and invoice metadata", async () => {
    const packs = 3;
    const url = await createCreditsCheckoutSession({
      userId: USER_ID,
      email: EMAIL,
      packs,
      timeZone: TIME_ZONE,
    });

    expect(url).toBe("https://checkout.stripe.test/c/cs_test");
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    const params = h.sessionsCreate.mock.calls[0][0];
    const metadata = expectedMetadata(packs);

    expect(params.mode).toBe("payment");
    expect(params.ui_mode).toBeUndefined();
    expect(params.line_items).toEqual([
      {
        price: PRICE_ID,
        quantity: packs,
        adjustable_quantity: {
          enabled: true,
          minimum: MIN_PURCHASE_PACKS,
          maximum: MAX_PURCHASE_PACKS,
        },
      },
    ]);
    expect(params.metadata).toEqual(metadata);
    expect(params.payment_intent_data).toEqual({ metadata });
    expect(params.invoice_creation).toEqual({
      enabled: true,
      invoice_data: { metadata },
    });
  });

  it("stamps embedded Checkout session, PaymentIntent, and invoice metadata", async () => {
    const packs = 2;
    const clientSecret = await createEmbeddedCreditsCheckoutSession({
      userId: USER_ID,
      email: EMAIL,
      packs,
      timeZone: TIME_ZONE,
    });

    expect(clientSecret).toBe("cs_test_secret");
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    const params = h.sessionsCreate.mock.calls[0][0];
    const metadata = expectedMetadata(packs);

    expect(params.ui_mode).toBe("embedded");
    expect(params.mode).toBe("payment");
    expect(params.redirect_on_completion).toBe("never");
    expect(params.line_items[0].quantity).toBe(packs);
    expect(params.metadata).toEqual(metadata);
    expect(params.payment_intent_data).toEqual({ metadata });
    expect(params.invoice_creation).toEqual({
      enabled: true,
      invoice_data: { metadata },
    });
  });

  it("does not stamp metadata.app on the shared Stripe Customer", async () => {
    h.customer = null;

    await createCreditsCheckoutSession({
      userId: USER_ID,
      email: EMAIL,
      packs: 1,
      timeZone: TIME_ZONE,
    });

    expect(h.customersCreate).toHaveBeenCalledTimes(1);
    expect(h.customersCreate.mock.calls[0][0]).toEqual({
      email: EMAIL,
      metadata: { user_id: USER_ID },
    });
  });
});
