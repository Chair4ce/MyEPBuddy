import { describe, expect, it } from "vitest";
import { shouldShowCoachingFeaturesIntro } from "../coaching-features-intro";

describe("shouldShowCoachingFeaturesIntro", () => {
  it("returns false when onboarding is incomplete", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: false,
        seenAt: null,
      }),
    ).toBe(false);
  });

  it("returns true when onboarding is complete and seen_at is null", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: null,
      }),
    ).toBe(true);
  });

  it("returns false when seen_at is set", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: "2026-07-21T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("returns false when optimistically dismissed", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: null,
        optimisticSeen: true,
      }),
    ).toBe(false);
  });
});
