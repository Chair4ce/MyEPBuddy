import { createAdminClient } from "@/lib/supabase/server";
import {
  getResendApiKey,
  sendResendEmail,
} from "@/lib/email/resend";
import type {
  ThankYouCandidate,
  ThankYouPrepareResult,
} from "@/lib/billing/purchase-thank-you-run";

type Admin = ReturnType<typeof createAdminClient>;

type PrepareRow = {
  action?: string;
  reason?: string;
  claim_id?: string;
  to?: string;
};

function asRpc(admin: Admin) {
  return admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

export function createPurchaseThankYouStore(admin: Admin = createAdminClient()) {
  const db = asRpc(admin);
  return {
    async activate(configuredCutoff: Date): Promise<Date> {
      const { data, error } = await db.rpc("purchase_thank_you_activate", {
        p_enabled_at: configuredCutoff.toISOString(),
      });
      if (error || typeof data !== "string") {
        throw new Error("purchase thank-you activate failed");
      }
      return new Date(data);
    },
    async prepare(input: {
      userId: string;
      stripeEventId: string;
      stripeCheckoutSessionId: string;
      eventCreatedAt: string;
      now: Date;
    }): Promise<ThankYouPrepareResult> {
      const { data, error } = await db.rpc("purchase_thank_you_prepare_send", {
        p_user_id: input.userId,
        p_stripe_checkout_session_id: input.stripeCheckoutSessionId,
        p_stripe_event_id: input.stripeEventId,
        p_event_created: input.eventCreatedAt,
        p_now: input.now.toISOString(),
      });
      if (error || !data || typeof data !== "object") {
        throw new Error("purchase thank-you prepare failed");
      }
      const row = data as PrepareRow;
      if (row.action === "send" && row.claim_id && row.to) {
        return { action: "send", claimId: row.claim_id, to: row.to };
      }
      return { action: "skip", reason: row.reason ?? "skip" };
    },
    async mark(input: {
      claimId: string;
      status: "sent" | "sending" | "suppressed";
      resendEmailId: string | null;
      error: string | null;
    }): Promise<void> {
      const { error } = await db.rpc("purchase_thank_you_mark", {
        p_claim_id: input.claimId,
        p_status: input.status,
        p_resend_email_id: input.resendEmailId,
        p_error: input.error,
        p_now: new Date().toISOString(),
      });
      if (error) throw new Error("purchase thank-you mark failed");
    },
    async expire(now: Date): Promise<number> {
      const { data, error } = await db.rpc("purchase_thank_you_expire", {
        p_now: now.toISOString(),
      });
      if (error) throw new Error("purchase thank-you expire failed");
      return typeof data === "number" ? data : 0;
    },
    async candidates(now: Date): Promise<ThankYouCandidate[]> {
      const { data, error } = await db.rpc("purchase_thank_you_retry_candidates", {
        p_now: now.toISOString(),
      });
      if (error || !Array.isArray(data)) {
        throw new Error("purchase thank-you candidates failed");
      }
      return data.map((row) => {
        const candidate = row as {
          user_id: string;
          stripe_event_id: string;
          stripe_checkout_session_id: string;
          event_created_at: string;
        };
        return {
          userId: candidate.user_id,
          stripeEventId: candidate.stripe_event_id,
          stripeCheckoutSessionId: candidate.stripe_checkout_session_id,
          eventCreatedAt: candidate.event_created_at,
        };
      });
    },
  };
}

export function createPurchaseThankYouMailer() {
  return {
    async send(input: {
      from: string;
      replyTo: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      idempotencyKey: string;
    }) {
      const resendApiKey = getResendApiKey();
      if (!resendApiKey) {
        throw new Error("Transactional email is not configured");
      }
      return sendResendEmail({
        resendApiKey,
        from: input.from,
        replyTo: input.replyTo,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        idempotencyKey: input.idempotencyKey,
      });
    },
  };
}
