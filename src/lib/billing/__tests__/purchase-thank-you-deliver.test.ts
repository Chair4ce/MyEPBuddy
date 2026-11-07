import { describe, expect, it, vi } from "vitest";
import { ThankYouDispatchClosedError, ThankYouNotSubmittedError } from "../purchase-thank-you";
import { deliverPurchaseThankYou } from "../purchase-thank-you-store";

describe("deliverPurchaseThankYou", () => {
  it("does not open the idempotency window when the provider is never called", async () => {
    const noteDispatch = vi.fn(async () => true);
    const send = vi.fn(async () => ({ id: "email_1" }));
    await expect(
      deliverPurchaseThankYou({
        apiKey: null,
        noteDispatch,
        send,
      })
    ).rejects.toBeInstanceOf(ThankYouNotSubmittedError);
    expect(noteDispatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("opens the idempotency window immediately before the provider call", async () => {
    const order: string[] = [];
    const result = await deliverPurchaseThankYou({
      apiKey: "re_test",
      noteDispatch: async () => {
        order.push("dispatch");
        return true;
      },
      send: async () => {
        order.push("send");
        return { id: "email_1" };
      },
    });
    expect(result).toEqual({ id: "email_1" });
    expect(order).toEqual(["dispatch", "send"]);
  });

  it("does not call the provider when the dispatch window is already closed", async () => {
    const send = vi.fn();
    await expect(
      deliverPurchaseThankYou({
        apiKey: "re_test",
        noteDispatch: async () => false,
        send,
      })
    ).rejects.toBeInstanceOf(ThankYouDispatchClosedError);
    expect(send).not.toHaveBeenCalled();
  });
});
