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

  it("does not auto-open while feature login intros are disabled", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: null,
      }),
    ).toBe(false);
  });

  it("returns false when seen_at is set", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: "2026-07-21T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("returns false when a live campaign is deferring optional intros", () => {
    expect(
      shouldShowCoachingFeaturesIntro({
        onboardingComplete: true,
        seenAt: null,
        deferOptionalIntros: true,
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
