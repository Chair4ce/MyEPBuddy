export type MarketingEmailOptInSource = "signup" | "onboarding" | "settings";

export const SIGNUP_MARKETING_OPT_IN_KEY = "epb_marketing_email_opt_in";

export const MARKETING_SETTINGS_URL = "https://myepbuddy.com/settings";

export const RESEND_UNSUBSCRIBE_PLACEHOLDER = "{{{RESEND_UNSUBSCRIBE_URL}}}";

/**
 * Campaign / Broadcast audience: mail everyone who has not opted out.
 * Legacy NULL (never asked) stays eligible. New signups default to false
 * until they check the box. Only `false` is excluded.
 */
export function eligibleForCycleReminderEmail(
  optIn: boolean | null | undefined
): boolean {
  return optIn !== false;
}

/**
 * Onboarding must not convert a legacy NULL into false — that would drop
 * existing users from the closeout campaign just for finishing terms.
 * Persist true always; persist false only when a preference was already recorded.
 */
export function onboardingMarketingPreferenceUpdate(
  current: boolean | null | undefined,
  requested: boolean
): boolean | "unchanged" {
  if (requested) return true;
  if (current == null) return "unchanged";
  return false;
}

/** Paste into every EPB cycle Broadcast, above the postal address. */
export function marketingBroadcastStopFooter(
  unsubscribeUrl: string = RESEND_UNSUBSCRIBE_PLACEHOLDER
): string {
  return `To stop these emails, log in at ${MARKETING_SETTINGS_URL}, open Email preferences, and turn off EPB cycle reminders. You can also unsubscribe here: ${unsubscribeUrl}`;
}

/** True only for an explicit opt-in value (never treat missing as yes). */
export function isMarketingEmailOptInTrue(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === "1";
}

export function persistSignupMarketingOptIn(optedIn: boolean): void {
  try {
    sessionStorage.setItem(SIGNUP_MARKETING_OPT_IN_KEY, optedIn ? "true" : "false");
  } catch {
    // Private mode / blocked storage
  }
}

export function readSignupMarketingOptIn(): boolean {
  try {
    return sessionStorage.getItem(SIGNUP_MARKETING_OPT_IN_KEY) === "true";
  } catch {
    return false;
  }
}

export function clearSignupMarketingOptIn(): void {
  try {
    sessionStorage.removeItem(SIGNUP_MARKETING_OPT_IN_KEY);
  } catch {
    // Private mode / blocked storage
  }
}

export function initialMarketingEmailOptIn(
  profileOptIn: boolean | null | undefined
): boolean {
  if (profileOptIn === true) return true;
  return readSignupMarketingOptIn();
}
