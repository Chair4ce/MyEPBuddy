import { describe, expect, it } from "vitest";
import {
  PURCHASE_THANK_YOU_FROM,
  PURCHASE_THANK_YOU_REPLY_TO,
  PURCHASE_THANK_YOU_SUBJECT,
  buildPurchaseThankYouEmail,
} from "../purchase-thank-you";

const APPROVED_BODY = [
  "Hi there,",
  "",
  "Thanks for buying tokens! Your purchase helps me maintain MyEPBuddy and keep it free for most people.",
  "",
  "I've spent a lot of hours writing EPBs, DECs, and awards over the last 20 years. I want to help you get that writing out of the way so you can focus on what matters. I hope MyEPBuddy gives you some of that time back.",
  "",
  "What would make writing your EPB easier or help you get better results? Just reply and let me know what would help.",
  "",
  "Thanks again,",
  "Jacy",
].join("\n");

describe("purchase thank-you copy", () => {
  it("uses the approved subject, body, From, and Reply-To", () => {
    const email = buildPurchaseThankYouEmail();
    expect(PURCHASE_THANK_YOU_SUBJECT).toBe("Thanks for supporting MyEPBuddy");
    expect(email.subject).toBe(PURCHASE_THANK_YOU_SUBJECT);
    expect(email.text).toBe(APPROVED_BODY);
    expect(PURCHASE_THANK_YOU_FROM).toBe(
      "MyEPBuddy <team@updates.myepbuddy.com>"
    );
    expect(PURCHASE_THANK_YOU_REPLY_TO).toBe("JacyLH@peridocs.io");
    expect(PURCHASE_THANK_YOU_REPLY_TO.endsWith(">")).toBe(false);
    expect(email.html).not.toMatch(/unsubscribe/i);
    expect(email.html).toContain("Hi there,");
    expect(email.html).toContain("Thanks again,");
  });
});
