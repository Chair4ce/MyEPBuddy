import { describe, expect, it } from "vitest";
import { resolveLoginIntroGates } from "@/lib/login-intro-gates";
import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";

const campaign: PurchaseCampaignOffer = {
  slug: "usaf-birthday-2026",
  title: "Air Force Birthday weekend",
  subtitle: "Bonus tokens",
  bonusCredits: 400,
  startsAt: "2026-09-18T04:00:00.000Z",
  endsAt: "2026-09-22T04:00:00.000Z",
  claimed: false,
};

const ready = {
  clientReady: true,
  isSigningOut: false,
  termsAccepted: true,
  creditsLoading: false,
  hasOwnKey: false,
  campaign: campaign as PurchaseCampaignOffer | null,
  campaignSeenSlug: null as string | null,
  onboardingStep: null as null,
  coachingSeenAt: null as string | null,
  promptRulesModeEnabled: false,
};

describe("resolveLoginIntroGates", () => {
  it("shows only the campaign promo during an open unclaimed window", () => {
    const gates = resolveLoginIntroGates(ready);
    expect(gates.showCampaignPromo).toBe(true);
    expect(gates.showCoachingIntro).toBe(false);
    expect(gates.showEpbPromptUpdate).toBe(false);
    expect(gates.showWelcomeTour).toBe(false);
  });

  it("keeps other intros suppressed after the promo is dismissed", () => {
    const gates = resolveLoginIntroGates({
      ...ready,
      campaignSeenSlug: "usaf-birthday-2026",
      campaignOptimisticSeen: true,
    });
    expect(gates.showCampaignPromo).toBe(false);
    expect(gates.showCoachingIntro).toBe(false);
    expect(gates.showEpbPromptUpdate).toBe(false);
    expect(gates.showWelcomeTour).toBe(false);
  });

  it("does not show the campaign promo until terms are accepted", () => {
    const gates = resolveLoginIntroGates({
      ...ready,
      termsAccepted: false,
      onboardingStep: "terms",
    });
    expect(gates.showCampaignPromo).toBe(false);
    expect(gates.showCoachingIntro).toBe(false);
  });

  it("does not stack the campaign promo on unfinished rank onboarding", () => {
    const gates = resolveLoginIntroGates({
      ...ready,
      onboardingStep: "rank",
    });
    expect(gates.showCampaignPromo).toBe(false);
  });

  it("does not resurrect coaching, prompt update, or welcome after the campaign ends", () => {
    const gates = resolveLoginIntroGates({
      ...ready,
      campaign: null,
    });
    expect(gates.showCampaignPromo).toBe(false);
    expect(gates.showCoachingIntro).toBe(false);
    expect(gates.showEpbPromptUpdate).toBe(false);
    expect(gates.showWelcomeTour).toBe(false);
    expect(gates.runEpbPromptRevisionCheck).toBe(true);
  });

  it("shows no optional intros while credits are still loading", () => {
    const gates = resolveLoginIntroGates({
      ...ready,
      creditsLoading: true,
      campaign: null,
    });
    expect(gates.deferOptionalIntros).toBe(true);
    expect(gates.showCampaignPromo).toBe(false);
    expect(gates.showCoachingIntro).toBe(false);
    expect(gates.showWelcomeTour).toBe(false);
  });
});
