export type CheckoutPaidInput = {
  userId: string;
  baseCredits: number;
  paymentStatus: string;
  stripeEventId: string;
  stripeCheckoutSessionId: string;
  eventCreatedAt: string;
};

export async function handleCheckoutPaid(
  input: CheckoutPaidInput,
  deps: {
    grant: (input: CheckoutPaidInput) => Promise<void>;
    thankYou: (input: CheckoutPaidInput) => Promise<void>;
  }
): Promise<void> {
  await deps.grant(input);
  if (input.paymentStatus !== "paid" || input.baseCredits !== 100) return;
  // Claim setup failures must reach the webhook so the Stripe event stays
  // unrecorded and can be retried. Provider outcomes are returned, not thrown.
  await deps.thankYou(input);
}
