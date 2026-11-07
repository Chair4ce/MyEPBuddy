import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

const WEBHOOK_SECRET = "whsec_test_myepbuddy";
const OWN_PRICE = "price_test_myepbuddy";
const OWN_PRODUCT = "prod_test_myepbuddy";
const LIVE_PRICE = "price_1TfRl1RmU7HJ5YzinnKdFWDl";
const LIVE_PRODUCT = "prod_UelHo41h4odIsL";
const USER_ID = "user_generic_1";

const signer = new Stripe("sk_test_myepbuddy", {
  apiVersion: "2025-02-24.acacia",
});

const h = vi.hoisted(() => {
  const seen = new Set<string>();
  return {
    seen,
    listLineItems: vi.fn(),
    grantCreditsFromStripe: vi.fn(async () => 100),
    isStripeEventProcessed: vi.fn(async (id: string) => seen.has(id)),
    recordStripeEvent: vi.fn(async (event: { id: string }) => {
      seen.add(event.id);
    }),
    resolveCampaignBonusGrant: vi.fn(async () => null),
    grantPurchaseCampaignBonus: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (
        payload: string,
        header: string,
        secret: string,
      ) => signer.webhooks.constructEvent(payload, header, secret),
    },
    checkout: {
      sessions: {
        listLineItems: h.listLineItems,
      },
    },
  }),
  grantCreditsFromStripe: h.grantCreditsFromStripe,
  isStripeEventProcessed: h.isStripeEventProcessed,
  recordStripeEvent: h.recordStripeEvent,
}));

vi.mock("@/lib/billing/purchase-campaign-server", () => ({
  resolveCampaignBonusGrant: h.resolveCampaignBonusGrant,
  grantPurchaseCampaignBonus: h.grantPurchaseCampaignBonus,
}));

import { POST } from "../route";

type CheckoutOpts = {
  id?: string;
  type?: string;
  metadata?: Record<string, string> | null;
  paymentStatus?: string;
  amountSubtotal?: number | null;
  customerEmail?: string | null;
};

function checkoutPayload(opts: CheckoutOpts = {}) {
  const event = {
    id: opts.id ?? "evt_test_1",
    object: "event",
    api_version: "2025-06-30.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: opts.type ?? "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: opts.paymentStatus ?? "paid",
        amount_subtotal: opts.amountSubtotal === undefined ? 100 : opts.amountSubtotal,
        customer_email: opts.customerEmail ?? null,
        metadata: opts.metadata === undefined ? { user_id: USER_ID } : opts.metadata,
      },
    },
  };
  return JSON.stringify(event);
}

function invoicePayload() {
  return JSON.stringify({
    id: "evt_invoice_1",
    object: "event",
    api_version: "2025-06-30.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "invoice.paid",
    data: {
      object: {
        id: "in_test_1",
        object: "invoice",
        metadata: {},
        customer_email: "buyer@example.com",
      },
    },
  });
}

function sign(payload: string, secret = WEBHOOK_SECRET) {
  return signer.webhooks.generateTestHeaderString({ payload, secret });
}

function post(payload: string, signature: string | null) {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("https://www.myepbuddy.com/api/billing/webhook", {
    method: "POST",
    headers,
    body: payload,
  }) as unknown as NextRequest;
}

function stubLineItems(priceId: string, productId: string, quantity: number) {
  h.listLineItems.mockResolvedValue({
    data: [{ quantity, price: { id: priceId, product: productId } }],
  });
}

describe("POST /api/billing/webhook app marker", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_myepbuddy";
    process.env.STRIPE_PRICE_100_CREDITS = OWN_PRICE;
    delete process.env.STRIPE_PRICE_150_CREDITS;
    delete process.env.STRIPE_STARTER_PRICE_ID;
    h.seen.clear();
    h.listLineItems.mockReset();
    h.grantCreditsFromStripe.mockClear();
    h.recordStripeEvent.mockClear();
    h.isStripeEventProcessed.mockClear();
    h.resolveCampaignBonusGrant.mockClear();
    h.grantPurchaseCampaignBonus.mockClear();
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 1);
  });

  it("rejects an invalid signature before classification or fulfillment", async () => {
    const payload = checkoutPayload({
      metadata: { app: "peridocs", user_id: USER_ID },
    });
    const response = await POST(post(payload, sign(payload, "whsec_wrong")));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(h.listLineItems).not.toHaveBeenCalled();
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
    expect(h.recordStripeEvent).not.toHaveBeenCalled();
    expect(h.resolveCampaignBonusGrant).not.toHaveBeenCalled();
  });

  it("fulfills an own-marked paid checkout exactly once", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 1);
    const payload = checkoutPayload({
      id: "evt_own_paid",
      metadata: {
        app: "myepbuddy",
        user_id: USER_ID,
        packs: "1",
        credits: "100",
        campaign_slug: "founders-week",
        campaign_tz: "America/Phoenix",
      },
    });
    const signature = sign(payload);

    const first = await POST(post(payload, signature));
    const second = await POST(post(payload, signature));

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ received: true });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(h.grantCreditsFromStripe).toHaveBeenCalledTimes(1);
    expect(h.grantCreditsFromStripe).toHaveBeenCalledWith({
      userId: USER_ID,
      credits: 100,
      stripeEventId: "evt_own_paid",
      stripeCheckoutSessionId: "cs_test_1",
    });
    expect(h.resolveCampaignBonusGrant).toHaveBeenCalledTimes(1);
  });

  it("fulfills an own-marked async payment once and keeps pack quantity", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 4);
    const unpaid = checkoutPayload({
      id: "evt_async_pending",
      metadata: {
        app: "myepbuddy",
        user_id: USER_ID,
        packs: "1",
        credits: "100",
      },
      paymentStatus: "unpaid",
      amountSubtotal: 400,
    });
    const paid = checkoutPayload({
      id: "evt_async_paid",
      type: "checkout.session.async_payment_succeeded",
      metadata: {
        app: "myepbuddy",
        user_id: USER_ID,
        packs: "1",
        credits: "100",
      },
      amountSubtotal: 400,
    });

    const pending = await POST(post(unpaid, sign(unpaid)));
    const succeeded = await POST(post(paid, sign(paid)));
    const replay = await POST(post(paid, sign(paid)));

    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toEqual({
      received: true,
      skipped: "unpaid",
    });
    expect(succeeded.status).toBe(200);
    await expect(succeeded.json()).resolves.toEqual({ received: true });
    await expect(replay.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(h.grantCreditsFromStripe).toHaveBeenCalledTimes(1);
    expect(h.grantCreditsFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 400, stripeEventId: "evt_async_paid" }),
    );
    expect(h.recordStripeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_async_pending" }),
    );
  });

  it("acknowledges an explicit PeriDocs checkout without fulfillment", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 1);
    const payload = checkoutPayload({
      id: "evt_peridocs",
      metadata: {
        app: "peridocs",
        user_id: USER_ID,
        packs: "1",
        credits: "100",
      },
      customerEmail: "buyer@example.com",
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      skipped: "foreign_app",
    });
    expect(h.listLineItems).not.toHaveBeenCalled();
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
    expect(h.grantPurchaseCampaignBonus).not.toHaveBeenCalled();
    expect(h.resolveCampaignBonusGrant).not.toHaveBeenCalled();
    expect(h.recordStripeEvent).not.toHaveBeenCalled();
  });

  it("fulfills a legacy unmarked checkout when the price is the configured MyEPBuddy price", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 2);
    const payload = checkoutPayload({
      id: "evt_legacy_configured",
      metadata: { user_id: USER_ID, packs: "1", credits: "100" },
      amountSubtotal: 200,
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(h.grantCreditsFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, credits: 200 }),
    );
  });

  it("fulfills a legacy unmarked checkout for the canonical live price and product", async () => {
    stubLineItems(LIVE_PRICE, LIVE_PRODUCT, 1);
    const payload = checkoutPayload({
      id: "evt_legacy_live",
      metadata: { user_id: USER_ID },
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(h.grantCreditsFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 100, userId: USER_ID }),
    );
  });

  it("does not let an own marker grant credits for an unknown price", async () => {
    stubLineItems("price_unknown", "prod_unknown", 1);
    const payload = checkoutPayload({
      id: "evt_own_wrong_price",
      metadata: { app: "myepbuddy", user_id: USER_ID, credits: "100" },
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      skipped: "invalid_price",
    });
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
  });

  it("does not grant credits for an unknown price with only a user id", async () => {
    stubLineItems("price_unknown", "prod_unknown", 1);
    const payload = checkoutPayload({
      id: "evt_unknown_price",
      metadata: { user_id: USER_ID },
      customerEmail: "buyer@example.com",
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      skipped: "invalid_price",
    });
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
    expect(h.grantPurchaseCampaignBonus).not.toHaveBeenCalled();
  });

  it("still fulfills an unknown marker when the price is the MyEPBuddy price", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 1);
    const payload = checkoutPayload({
      id: "evt_unknown_marker_own_price",
      metadata: { app: "some-other-app", user_id: USER_ID },
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(h.grantCreditsFromStripe).toHaveBeenCalledTimes(1);
  });

  it("does not treat an unknown marker or unrelated event as a foreign app", async () => {
    stubLineItems("price_unknown", "prod_unknown", 1);
    const marked = checkoutPayload({
      id: "evt_unknown_marker",
      metadata: { app: "some-other-app", user_id: USER_ID },
    });
    const markedResponse = await POST(post(marked, sign(marked)));
    const markedBody = await markedResponse.json();

    expect(markedResponse.status).toBe(200);
    expect(markedBody.skipped).not.toBe("foreign_app");
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();

    const invoice = invoicePayload();
    const invoiceResponse = await POST(post(invoice, sign(invoice)));
    const invoiceBody = await invoiceResponse.json();

    expect(invoiceResponse.status).toBe(200);
    expect(invoiceBody).toEqual({ received: true });
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
  });

  it("does not treat email alone as proof the payment belongs here", async () => {
    stubLineItems(OWN_PRICE, OWN_PRODUCT, 1);
    const payload = checkoutPayload({
      id: "evt_email_only",
      metadata: {},
      customerEmail: "buyer@example.com",
    });

    const response = await POST(post(payload, sign(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      skipped: "invalid_metadata",
    });
    expect(h.grantCreditsFromStripe).not.toHaveBeenCalled();
  });
});
