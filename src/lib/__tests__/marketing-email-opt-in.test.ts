import { describe, expect, it } from "vitest";
import {
  eligibleForCycleReminderEmail,
  initialMarketingEmailOptIn,
  isMarketingEmailOptInTrue,
  MARKETING_SETTINGS_URL,
  marketingBroadcastStopFooter,
  onboardingMarketingPreferenceUpdate,
} from "../marketing-email-opt-in";

describe("isMarketingEmailOptInTrue", () => {
  it("accepts only explicit true-like values", () => {
    expect(isMarketingEmailOptInTrue(true)).toBe(true);
    expect(isMarketingEmailOptInTrue("true")).toBe(true);
    expect(isMarketingEmailOptInTrue("t")).toBe(true);
    expect(isMarketingEmailOptInTrue("1")).toBe(true);
  });

  it("rejects missing, false, and junk", () => {
    expect(isMarketingEmailOptInTrue(false)).toBe(false);
    expect(isMarketingEmailOptInTrue(null)).toBe(false);
    expect(isMarketingEmailOptInTrue(undefined)).toBe(false);
    expect(isMarketingEmailOptInTrue("false")).toBe(false);
    expect(isMarketingEmailOptInTrue("yes")).toBe(false);
    expect(isMarketingEmailOptInTrue(1)).toBe(false);
  });
});

describe("initialMarketingEmailOptIn", () => {
  it("prefers a recorded profile opt-in", () => {
    expect(initialMarketingEmailOptIn(true)).toBe(true);
  });

  it("does not treat legacy null as opted in", () => {
    expect(initialMarketingEmailOptIn(null)).toBe(false);
    expect(initialMarketingEmailOptIn(undefined)).toBe(false);
  });
});

describe("eligibleForCycleReminderEmail", () => {
  it("mails legacy NULL and explicit opt-in; excludes opt-out", () => {
    expect(eligibleForCycleReminderEmail(null)).toBe(true);
    expect(eligibleForCycleReminderEmail(undefined)).toBe(true);
    expect(eligibleForCycleReminderEmail(true)).toBe(true);
    expect(eligibleForCycleReminderEmail(false)).toBe(false);
  });
});

describe("onboardingMarketingPreferenceUpdate", () => {
  it("does not opt existing NULL users out when they leave the box unchecked", () => {
    expect(onboardingMarketingPreferenceUpdate(null, false)).toBe("unchanged");
    expect(onboardingMarketingPreferenceUpdate(undefined, false)).toBe(
      "unchanged"
    );
  });

  it("records an explicit opt-in from onboarding", () => {
    expect(onboardingMarketingPreferenceUpdate(null, true)).toBe(true);
    expect(onboardingMarketingPreferenceUpdate(false, true)).toBe(true);
  });

  it("records an opt-out only when a preference already exists", () => {
    expect(onboardingMarketingPreferenceUpdate(true, false)).toBe(false);
    expect(onboardingMarketingPreferenceUpdate(false, false)).toBe(false);
  });
});

describe("marketingBroadcastStopFooter", () => {
  it("tells them to use Settings or unsubscribe", () => {
    const footer = marketingBroadcastStopFooter();
    expect(footer).toContain(MARKETING_SETTINGS_URL);
    expect(footer).toContain("Email preferences");
    expect(footer).toContain("turn off EPB cycle reminders");
    expect(footer).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });
});
