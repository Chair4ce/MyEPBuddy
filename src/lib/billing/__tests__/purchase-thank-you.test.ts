import { describe, expect, it } from "vitest";
import {
  PURCHASE_THANK_YOU_LEASE_MS,
  PURCHASE_THANK_YOU_MAX_ATTEMPTS,
  PURCHASE_THANK_YOU_WINDOW_MS,
  effectiveCutoff,
  nextClaimAction,
  purchaseThankYouIdempotencyKey,
  qualifiesForPurchaseThankYou,
  readPurchaseThankYouConfig,
} from "../purchase-thank-you";

const ACTIVATED = "2026-11-07T05:11:00.000Z";
const AFTER = "2026-11-07T05:12:00.000Z";
const BEFORE = "2026-11-07T05:10:00.000Z";

describe("readPurchaseThankYouConfig", () => {
  it("stays off unless mode is live and the cutoff parses", () => {
    expect(readPurchaseThankYouConfig({})).toEqual({ mode: "off", enabledAt: null });
    expect(
      readPurchaseThankYouConfig({ PURCHASE_THANK_YOU_MODE: "live" })
    ).toEqual({ mode: "off", enabledAt: null });
    expect(
      readPurchaseThankYouConfig({
        PURCHASE_THANK_YOU_MODE: "live",
        PURCHASE_THANK_YOU_ENABLED_AT: "not-a-date",
      })
    ).toEqual({ mode: "off", enabledAt: null });
    expect(
      readPurchaseThankYouConfig({
        PURCHASE_THANK_YOU_MODE: "LIVE",
        PURCHASE_THANK_YOU_ENABLED_AT: ACTIVATED,
      }).mode
    ).toBe("live");
  });
});

describe("effectiveCutoff", () => {
  it("never moves earlier than the first persisted cutoff", () => {
    const stored = new Date(ACTIVATED);
    const earlier = new Date(BEFORE);
    const later = new Date(AFTER);
    expect(effectiveCutoff(null, stored)?.toISOString()).toBe(ACTIVATED);
    expect(effectiveCutoff(stored, earlier)?.toISOString()).toBe(ACTIVATED);
    expect(effectiveCutoff(stored, later)?.toISOString()).toBe(AFTER);
    expect(effectiveCutoff(stored, null)?.toISOString()).toBe(ACTIVATED);
  });
});

describe("qualifiesForPurchaseThankYou", () => {
  const live = {
    mode: "live" as const,
    cutoff: ACTIVATED,
    eventCreatedAt: AFTER,
    paymentStatus: "paid",
    grantCommitted: true,
    baseCredits: 100,
    marketingEmailOptIn: false as boolean | null,
  };

  it("accepts the first paid exact-100 grant after the cutoff even when opted out", () => {
    expect(qualifiesForPurchaseThankYou(live)).toBe(true);
    expect(
      qualifiesForPurchaseThankYou({ ...live, marketingEmailOptIn: null })
    ).toBe(true);
  });

  it("rejects feature off, old events, unpaid states, other amounts, and a failed grant", () => {
    expect(qualifiesForPurchaseThankYou({ ...live, mode: "off" })).toBe(false);
    expect(
      qualifiesForPurchaseThankYou({ ...live, eventCreatedAt: BEFORE })
    ).toBe(false);
    expect(
      qualifiesForPurchaseThankYou({ ...live, eventCreatedAt: ACTIVATED })
    ).toBe(true);
    for (const paymentStatus of ["unpaid", "failed", "cancelled", "no_payment_required"]) {
      expect(
        qualifiesForPurchaseThankYou({ ...live, paymentStatus })
      ).toBe(false);
    }
    expect(qualifiesForPurchaseThankYou({ ...live, baseCredits: 200 })).toBe(false);
    expect(qualifiesForPurchaseThankYou({ ...live, baseCredits: 0 })).toBe(false);
    expect(
      qualifiesForPurchaseThankYou({ ...live, grantCommitted: false })
    ).toBe(false);
  });
});

describe("nextClaimAction", () => {
  const now = new Date("2026-11-07T06:00:00.000Z");

  it("sends a new pending claim and stops after sent or suppressed", () => {
    expect(
      nextClaimAction(
        {
          status: "pending",
          attempts: 0,
          firstAttemptAt: null,
          sendingAt: null,
          resendEmailId: null,
          lastError: null,
        },
        now
      )
    ).toBe("send");
    expect(
      nextClaimAction(
        {
          status: "sent",
          attempts: 1,
          firstAttemptAt: now.toISOString(),
          sendingAt: now.toISOString(),
          resendEmailId: "email_1",
          lastError: null,
        },
        now
      )
    ).toBe("stop");
    expect(
      nextClaimAction(
        {
          status: "suppressed",
          attempts: 1,
          firstAttemptAt: now.toISOString(),
          sendingAt: now.toISOString(),
          resendEmailId: null,
          lastError: "suppressed",
        },
        now
      )
    ).toBe("stop");
  });

  it("retries an uncertain send only inside the window and then marks it ambiguous", () => {
    const first = new Date(now.getTime() - 60_000).toISOString();
    expect(
      nextClaimAction(
        {
          status: "sending",
          attempts: 1,
          firstAttemptAt: first,
          sendingAt: new Date(now.getTime() - PURCHASE_THANK_YOU_LEASE_MS - 1000).toISOString(),
          resendEmailId: null,
          lastError: "timeout",
        },
        now
      )
    ).toBe("send");
    expect(
      nextClaimAction(
        {
          status: "sending",
          attempts: 1,
          firstAttemptAt: first,
          sendingAt: new Date(now.getTime() - 1000).toISOString(),
          resendEmailId: null,
          lastError: "timeout",
        },
        now
      )
    ).toBe("in_flight");
    const expired = new Date(now.getTime() - PURCHASE_THANK_YOU_WINDOW_MS - 1000).toISOString();
    expect(
      nextClaimAction(
        {
          status: "sending",
          attempts: 2,
          firstAttemptAt: expired,
          sendingAt: expired,
          resendEmailId: null,
          lastError: "timeout",
        },
        now
      )
    ).toBe("ambiguous");
    expect(
      nextClaimAction(
        {
          status: "sending",
          attempts: PURCHASE_THANK_YOU_MAX_ATTEMPTS,
          firstAttemptAt: first,
          sendingAt: new Date(now.getTime() - PURCHASE_THANK_YOU_LEASE_MS - 1000).toISOString(),
          resendEmailId: null,
          lastError: "timeout",
        },
        now
      )
    ).toBe("ambiguous");
  });
});

describe("purchaseThankYouIdempotencyKey", () => {
  it("is stable per buyer and safe for Resend", () => {
    const userId = "5d6a6c3e-1b7a-4c2d-9f0e-123456789abc";
    expect(purchaseThankYouIdempotencyKey(userId)).toBe(
      `purchase-thank-you/${userId}`
    );
    expect(purchaseThankYouIdempotencyKey(userId)).toBe(
      purchaseThankYouIdempotencyKey(userId)
    );
    expect(purchaseThankYouIdempotencyKey(userId)).not.toMatch(/\s/);
  });
});
