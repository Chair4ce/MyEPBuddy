import { ResendSendError } from "@/lib/email/resend";
import {
  buildPurchaseThankYouEmail,
  PURCHASE_THANK_YOU_FROM,
  PURCHASE_THANK_YOU_REPLY_TO,
} from "@/lib/email/purchase-thank-you";
import {
  classifyThankYouSendError,
  purchaseThankYouIdempotencyKey,
  qualifiesForPurchaseThankYou,
  readPurchaseThankYouConfig,
  ThankYouDispatchClosedError,
  ThankYouNotSubmittedError,
} from "@/lib/billing/purchase-thank-you";

export type ThankYouPrepareResult =
  | { action: "send"; claimId: string; to: string }
  | { action: "skip"; reason: string };

export type ThankYouMail = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  claimId: string;
};

export type ThankYouRunDeps = {
  env: Record<string, string | undefined>;
  now: Date;
  activate: (configuredCutoff: Date) => Promise<Date>;
  prepare: (input: {
    userId: string;
    stripeEventId: string;
    stripeCheckoutSessionId: string;
    eventCreatedAt: string;
    now: Date;
  }) => Promise<ThankYouPrepareResult>;
  mark: (input: {
    claimId: string;
    status: "sent" | "sending" | "suppressed" | "failed";
    resendEmailId: string | null;
    error: string | null;
  }) => Promise<void>;
  mailer: {
    send: (input: ThankYouMail) => Promise<{ id: string | null }>;
  };
};

export type ThankYouRunInput = {
  userId: string;
  baseCredits: number;
  paymentStatus: string;
  grantCommitted: boolean;
  stripeEventId: string;
  stripeCheckoutSessionId: string;
  eventCreatedAt: string;
  marketingEmailOptIn?: boolean | null;
};

export type ThankYouRunResult =
  | { action: "sent"; claimId: string }
  | { action: "uncertain"; claimId: string }
  | { action: "skip"; reason: string };

export async function runPurchaseThankYou(
  input: ThankYouRunInput,
  deps: ThankYouRunDeps
): Promise<ThankYouRunResult> {
  const config = readPurchaseThankYouConfig(deps.env);
  if (config.mode !== "live" || !config.enabledAt) {
    return { action: "skip", reason: "off" };
  }

  const cutoff = await deps.activate(config.enabledAt);
  if (
    !qualifiesForPurchaseThankYou({
      mode: "live",
      cutoff: cutoff.toISOString(),
      eventCreatedAt: input.eventCreatedAt,
      paymentStatus: input.paymentStatus,
      grantCommitted: input.grantCommitted,
      baseCredits: input.baseCredits,
      marketingEmailOptIn: input.marketingEmailOptIn,
    })
  ) {
    const eventAt = Date.parse(input.eventCreatedAt);
    if (
      input.grantCommitted &&
      input.paymentStatus === "paid" &&
      input.baseCredits === 100 &&
      Number.isFinite(eventAt) &&
      eventAt < cutoff.getTime()
    ) {
      await deps.prepare({
        userId: input.userId,
        stripeEventId: input.stripeEventId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        eventCreatedAt: input.eventCreatedAt,
        now: deps.now,
      });
      return { action: "skip", reason: "cutoff" };
    }
    return { action: "skip", reason: "not_qualifying" };
  }

  const prepared = await deps.prepare({
    userId: input.userId,
    stripeEventId: input.stripeEventId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    eventCreatedAt: input.eventCreatedAt,
    now: deps.now,
  });
  if (prepared.action !== "send") {
    return { action: "skip", reason: prepared.reason };
  }

  const email = buildPurchaseThankYouEmail();
  try {
    const sent = await deps.mailer.send({
      from: PURCHASE_THANK_YOU_FROM,
      replyTo: PURCHASE_THANK_YOU_REPLY_TO,
      to: prepared.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: purchaseThankYouIdempotencyKey(input.userId),
      claimId: prepared.claimId,
    });
    if (!sent.id) {
      await deps.mark({
        claimId: prepared.claimId,
        status: "sending",
        resendEmailId: null,
        error: "missing_provider_id",
      });
      return { action: "uncertain", claimId: prepared.claimId };
    }
    await deps.mark({
      claimId: prepared.claimId,
      status: "sent",
      resendEmailId: sent.id,
      error: null,
    });
    return { action: "sent", claimId: prepared.claimId };
  } catch (error) {
    if (error instanceof ThankYouDispatchClosedError) {
      return { action: "skip", reason: "ambiguous" };
    }
    if (error instanceof ThankYouNotSubmittedError) {
      await deps.mark({
        claimId: prepared.claimId,
        status: "failed",
        resendEmailId: null,
        error: "not_submitted",
      });
      return { action: "skip", reason: "not_submitted" };
    }
    const status = error instanceof ResendSendError ? error.status : null;
    const detail =
      error instanceof ResendSendError
        ? error.detail
        : error instanceof Error
          ? error.message
          : "send failed";
    const kind = classifyThankYouSendError({ status, detail });
    if (kind === "suppressed") {
      await deps.mark({
        claimId: prepared.claimId,
        status: "suppressed",
        resendEmailId: null,
        error: detail.slice(0, 500),
      });
      return { action: "skip", reason: "suppressed" };
    }
    await deps.mark({
      claimId: prepared.claimId,
      status: "sending",
      resendEmailId: null,
      error: detail.slice(0, 500),
    });
    return { action: "uncertain", claimId: prepared.claimId };
  }
}

export type ThankYouCandidate = {
  userId: string;
  stripeEventId: string;
  stripeCheckoutSessionId: string;
  eventCreatedAt: string;
};

export async function retryPurchaseThankYous(
  deps: ThankYouRunDeps & {
    candidates: (now: Date) => Promise<ThankYouCandidate[]>;
    expire: (now: Date) => Promise<number>;
  }
): Promise<{ skipped: boolean; expired: number; seen: number }> {
  const config = readPurchaseThankYouConfig(deps.env);
  if (config.mode !== "live" || !config.enabledAt) {
    return { skipped: true, expired: 0, seen: 0 };
  }
  await deps.activate(config.enabledAt);
  const expired = await deps.expire(deps.now);
  const rows = await deps.candidates(deps.now);
  for (const row of rows) {
    await runPurchaseThankYou(
      {
        ...row,
        baseCredits: 100,
        paymentStatus: "paid",
        grantCommitted: true,
      },
      deps
    );
  }
  return { skipped: false, expired, seen: rows.length };
}
