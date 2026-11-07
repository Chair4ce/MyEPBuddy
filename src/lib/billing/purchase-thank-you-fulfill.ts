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
  try {
    await deps.thankYou(input);
  } catch (error) {
    console.error("[billing/webhook] purchase thank-you failed", error);
  }
}
