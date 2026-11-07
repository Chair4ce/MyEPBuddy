import { describe, expect, it, vi } from "vitest";
import { ResendSendError } from "@/lib/email/resend";
import { ThankYouNotSubmittedError } from "../purchase-thank-you";
import {
  PURCHASE_THANK_YOU_FROM,
  PURCHASE_THANK_YOU_REPLY_TO,
  PURCHASE_THANK_YOU_SUBJECT,
} from "@/lib/email/purchase-thank-you";
import { handleCheckoutPaid } from "../purchase-thank-you-fulfill";
import {
  retryPurchaseThankYous,
  runPurchaseThankYou,
  type ThankYouPrepareResult,
} from "../purchase-thank-you-run";

const USER = "5d6a6c3e-1b7a-4c2d-9f0e-123456789abc";
const CUTOFF = "2026-11-07T05:11:00.000Z";
const EVENT_AT = "2026-11-07T05:12:00.000Z";

function liveEnv(): Record<string, string> {
  return {
    PURCHASE_THANK_YOU_MODE: "live",
    PURCHASE_THANK_YOU_ENABLED_AT: CUTOFF,
  };
}

describe("handleCheckoutPaid", () => {
  it("grants before any thank-you work and still grants when thank-you throws", async () => {
    const order: string[] = [];
    const grant = vi.fn(async () => {
      order.push("grant");
    });
    const thankYou = vi.fn(async () => {
      order.push("thank-you");
      throw new Error("mail down");
    });
    await expect(
      handleCheckoutPaid(
        {
          userId: USER,
          baseCredits: 100,
          paymentStatus: "paid",
          stripeEventId: "evt_new",
          stripeCheckoutSessionId: "cs_new",
          eventCreatedAt: EVENT_AT,
        },
        { grant, thankYou }
      )
    ).rejects.toThrow("mail down");
    expect(order).toEqual(["grant", "thank-you"]);
  });

  it("does not thank the buyer when the grant fails", async () => {
    const thankYou = vi.fn();
    await expect(
      handleCheckoutPaid(
        {
          userId: USER,
          baseCredits: 100,
          paymentStatus: "paid",
          stripeEventId: "evt_new",
          stripeCheckoutSessionId: "cs_new",
          eventCreatedAt: EVENT_AT,
        },
        {
          grant: async () => {
            throw new Error("grant failed");
          },
          thankYou,
        }
      )
    ).rejects.toThrow("grant failed");
    expect(thankYou).not.toHaveBeenCalled();
  });

  it("does not thank a 200-token purchase", async () => {
    const thankYou = vi.fn();
    await handleCheckoutPaid(
      {
        userId: USER,
        baseCredits: 200,
        paymentStatus: "paid",
        stripeEventId: "evt_new",
        stripeCheckoutSessionId: "cs_new",
        eventCreatedAt: EVENT_AT,
      },
      { grant: async () => undefined, thankYou }
    );
    expect(thankYou).not.toHaveBeenCalled();
  });
});

describe("runPurchaseThankYou", () => {
  function harness(
    prepare: () => Promise<ThankYouPrepareResult> = async () => ({
      action: "send",
      claimId: "claim-1",
      to: "buyer@example.com",
    })
  ) {
    const sends: Record<string, unknown>[] = [];
    const marks: Record<string, unknown>[] = [];
    const prepareFn = vi.fn(prepare);
    const activate = vi.fn(async () => new Date(CUTOFF));
    const mailer = {
      send: vi.fn(async (payload: Record<string, unknown>): Promise<{ id: string | null }> => {
        sends.push(payload);
        return { id: "email_1" };
      }),
    };
    return {
      sends,
      marks,
      activate,
      mailer,
      deps: {
        env: liveEnv(),
        now: new Date("2026-11-07T05:13:00.000Z"),
        activate,
        prepare: prepareFn,
        mark: async (row: Record<string, unknown>) => {
          marks.push(row);
        },
        mailer,
      },
    };
  }

  const input = {
    userId: USER,
    baseCredits: 100,
    paymentStatus: "paid",
    grantCommitted: true,
    stripeEventId: "evt_new",
    stripeCheckoutSessionId: "cs_new",
    eventCreatedAt: EVENT_AT,
    marketingEmailOptIn: false as boolean | null,
  };

  it("sends the exact payload once for an opted-out first 100", async () => {
    const { deps, sends, marks } = harness();
    const result = await runPurchaseThankYou(input, deps);
    expect(result).toEqual({ action: "sent", claimId: "claim-1" });
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      from: PURCHASE_THANK_YOU_FROM,
      replyTo: PURCHASE_THANK_YOU_REPLY_TO,
      to: "buyer@example.com",
      subject: PURCHASE_THANK_YOU_SUBJECT,
      idempotencyKey: `purchase-thank-you/${USER}`,
    });
    expect(sends[0]?.text).toContain("Hi there,");
    expect(String(sends[0]?.text)).not.toMatch(/unsubscribe/i);
    expect(marks).toEqual([
      { claimId: "claim-1", status: "sent", resendEmailId: "email_1", error: null },
    ]);
  });

  it("does not send when the mode is off or the Stripe event predates the cutoff", async () => {
    const off = harness();
    off.deps.env = {};
    expect((await runPurchaseThankYou(input, off.deps)).action).toBe("skip");
    expect(off.mailer.send).not.toHaveBeenCalled();
    expect(off.activate).not.toHaveBeenCalled();

    const old = harness();
    const result = await runPurchaseThankYou(
      { ...input, eventCreatedAt: "2026-11-07T05:10:00.000Z" },
      old.deps
    );
    expect(result).toMatchObject({ action: "skip", reason: "cutoff" });
    expect(old.deps.prepare).toHaveBeenCalled();
    expect(old.mailer.send).not.toHaveBeenCalled();
  });

  it("does not mark a missing provider id as sent", async () => {
    const { deps, marks, mailer } = harness();
    mailer.send = vi.fn(async () => ({ id: null }));
    const result = await runPurchaseThankYou(input, deps);
    expect(result.action).toBe("uncertain");
    expect(marks[0]).toMatchObject({ status: "sending", resendEmailId: null });
  });

  it("records a pre-provider failure without treating it as an uncertain provider response", async () => {
    const { deps, marks } = harness();
    deps.mailer.send = vi.fn(async () => {
      throw new ThankYouNotSubmittedError();
    });
    const result = await runPurchaseThankYou(input, deps);
    expect(result).toMatchObject({ action: "skip", reason: "not_submitted" });
    expect(marks[0]).toMatchObject({ status: "failed", error: "not_submitted" });
  });

  it("keeps an uncertain send on the same claim without throwing", async () => {
    const { deps, marks } = harness();
    deps.mailer.send = vi.fn(async () => {
      throw new ResendSendError(500, "timeout talking to provider");
    });
    const result = await runPurchaseThankYou(input, deps);
    expect(result.action).toBe("uncertain");
    expect(marks[0]).toMatchObject({ claimId: "claim-1", status: "sending" });
  });

  it("closes a provider suppression without another recipient attempt", async () => {
    const { deps, marks, mailer } = harness();
    mailer.send = vi.fn(async () => {
      throw new ResendSendError(451, "recipient suppressed after bounce");
    });
    const result = await runPurchaseThankYou(input, deps);
    expect(result).toMatchObject({ action: "skip", reason: "suppressed" });
    expect(marks[0]).toMatchObject({ status: "suppressed" });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("retries only existing claims and does nothing while off", async () => {
    const prepare = vi.fn(async () => ({ action: "skip" as const, reason: "sent" }));
    const candidates = vi.fn(async () => [
      {
        userId: USER,
        stripeEventId: "evt_new",
        stripeCheckoutSessionId: "cs_new",
        eventCreatedAt: EVENT_AT,
      },
    ]);
    await retryPurchaseThankYous({
      env: {},
      now: new Date(EVENT_AT),
      activate: async () => new Date(CUTOFF),
      prepare,
      mark: async () => undefined,
      candidates,
      expire: async () => 0,
      mailer: { send: async () => ({ id: "email_1" }) },
    });
    expect(candidates).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not send when the claim is already reserved or finished", async () => {
    const inflight = harness(async () => ({ action: "skip", reason: "in_flight" }));
    expect((await runPurchaseThankYou(input, inflight.deps)).action).toBe("skip");
    expect(inflight.mailer.send).not.toHaveBeenCalled();

    const done = harness(async () => ({ action: "skip", reason: "sent" }));
    expect((await runPurchaseThankYou(input, done.deps)).action).toBe("skip");
    expect(done.mailer.send).not.toHaveBeenCalled();
  });
});
