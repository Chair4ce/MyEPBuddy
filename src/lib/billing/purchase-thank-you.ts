export const PURCHASE_THANK_YOU_WINDOW_MS = 23 * 60 * 60 * 1000;
export const PURCHASE_THANK_YOU_LEASE_MS = 5 * 60 * 1000;
export const PURCHASE_THANK_YOU_MAX_ATTEMPTS = 5;

export type PurchaseThankYouMode = "off" | "live";

export type PurchaseThankYouConfig = {
  mode: PurchaseThankYouMode;
  enabledAt: Date | null;
};

export type ClaimStatus =
  | "pending"
  | "sending"
  | "sent"
  | "suppressed"
  | "failed"
  | "ambiguous";

export type ClaimSnapshot = {
  status: ClaimStatus;
  attempts: number;
  firstAttemptAt: string | null;
  sendingAt: string | null;
  resendEmailId: string | null;
  lastError: string | null;
};

export type ClaimAction = "send" | "stop" | "in_flight" | "ambiguous";

export function readPurchaseThankYouConfig(
  env: Record<string, string | undefined>
): PurchaseThankYouConfig {
  const modeRaw = (env.PURCHASE_THANK_YOU_MODE ?? "").trim().toLowerCase();
  const enabledRaw = (env.PURCHASE_THANK_YOU_ENABLED_AT ?? "").trim();
  const enabledAt = parseTimestamp(enabledRaw);
  if (modeRaw !== "live" || !enabledAt) {
    return { mode: "off", enabledAt: null };
  }
  return { mode: "live", enabledAt };
}

export function effectiveCutoff(
  stored: Date | null,
  configured: Date | null
): Date | null {
  if (!stored) return configured;
  if (!configured) return stored;
  return stored.getTime() >= configured.getTime() ? stored : configured;
}

export function qualifiesForPurchaseThankYou(input: {
  mode: PurchaseThankYouMode;
  cutoff: string | null;
  eventCreatedAt: string;
  paymentStatus: string;
  grantCommitted: boolean;
  baseCredits: number;
  marketingEmailOptIn?: boolean | null;
}): boolean {
  if (input.mode !== "live" || !input.cutoff) return false;
  if (!input.grantCommitted) return false;
  if (input.paymentStatus !== "paid") return false;
  if (input.baseCredits !== 100) return false;
  const eventAt = Date.parse(input.eventCreatedAt);
  const cutoffAt = Date.parse(input.cutoff);
  if (!Number.isFinite(eventAt) || !Number.isFinite(cutoffAt)) return false;
  return eventAt >= cutoffAt;
}

export function purchaseThankYouIdempotencyKey(userId: string): string {
  return `purchase-thank-you/${userId}`;
}

export function nextClaimAction(claim: ClaimSnapshot, now: Date): ClaimAction {
  if (
    claim.status === "sent" ||
    claim.status === "suppressed" ||
    claim.status === "ambiguous"
  ) {
    return "stop";
  }
  if (claim.lastError === "no_email") return "stop";
  if (claim.resendEmailId) return "stop";

  const firstAt = claim.firstAttemptAt ? Date.parse(claim.firstAttemptAt) : null;
  if (firstAt != null && now.getTime() - firstAt > PURCHASE_THANK_YOU_WINDOW_MS) {
    return "ambiguous";
  }
  if (claim.attempts >= PURCHASE_THANK_YOU_MAX_ATTEMPTS && claim.status !== "pending") {
    return "ambiguous";
  }
  if (claim.status === "pending" || claim.status === "failed") return "send";

  if (claim.status === "sending") {
    const sendingAt = claim.sendingAt ? Date.parse(claim.sendingAt) : null;
    if (sendingAt == null) return "send";
    if (now.getTime() - sendingAt >= PURCHASE_THANK_YOU_LEASE_MS) return "send";
    return "in_flight";
  }

  const unreachable: never = claim.status;
  return unreachable;
}

function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

export function classifyThankYouSendError(error: {
  status: number | null;
  detail: string;
}): "suppressed" | "uncertain" {
  const detail = error.detail.toLowerCase();
  if (
    detail.includes("suppressed") ||
    detail.includes("bounce") ||
    detail.includes("complaint")
  ) {
    return "suppressed";
  }
  if (error.status === 451) return "suppressed";
  return "uncertain";
}
