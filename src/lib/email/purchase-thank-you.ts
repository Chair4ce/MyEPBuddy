import { escapeHtml } from "@/lib/email/html-safe";

export const PURCHASE_THANK_YOU_SUBJECT = "Thanks for supporting MyEPBuddy";

export const PURCHASE_THANK_YOU_FROM =
  "MyEPBuddy <team@updates.myepbuddy.com>";

export const PURCHASE_THANK_YOU_REPLY_TO = "JacyLH@peridocs.io";

export const PURCHASE_THANK_YOU_TEXT = [
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

export function buildPurchaseThankYouEmail(): {
  subject: string;
  text: string;
  html: string;
} {
  const paragraphs = PURCHASE_THANK_YOU_TEXT.split("\n\n").map(
    (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`
  );
  return {
    subject: PURCHASE_THANK_YOU_SUBJECT,
    text: PURCHASE_THANK_YOU_TEXT,
    html: paragraphs.join(""),
  };
}
