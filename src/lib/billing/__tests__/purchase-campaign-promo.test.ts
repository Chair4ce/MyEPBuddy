import { describe, expect, it } from "vitest";
import { shouldShowPurchaseCampaignPromo } from "@/lib/billing/purchase-campaign-promo";
import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";

const campaign: PurchaseCampaignOffer = {
  slug: "usaf-birthday-2026",
  title: "Air Force Birthday weekend",
  subtitle: "Bonus tokens",
  bonusCredits: 400,
  startsAt: "2026-09-18T04:00:00.000Z",
  endsAt: "2026-09-21T04:00:00.000Z",
  claimed: false,
};

const visible = {
  onboardingComplete: true,
  blockingIntroOpen: false,
  creditsLoading: false,
  hasOwnKey: false,
  campaign,
  seenSlug: null as string | null,
};

describe("shouldShowPurchaseCampaignPromo", () => {
  it("shows once when the campaign is live and unseen", () => {
    expect(shouldShowPurchaseCampaignPromo(visible)).toBe(true);
  });

  it("waits for onboarding, credits, and other intros", () => {
    expect(
      shouldShowPurchaseCampaignPromo({ ...visible, onboardingComplete: false }),
    ).toBe(false);
    expect(
      shouldShowPurchaseCampaignPromo({ ...visible, blockingIntroOpen: true }),
    ).toBe(false);
    expect(
      shouldShowPurchaseCampaignPromo({ ...visible, creditsLoading: true }),
    ).toBe(false);
  });

  it("does not show for BYOK, claimed bonus, or a matching seen slug", () => {
    expect(shouldShowPurchaseCampaignPromo({ ...visible, hasOwnKey: true })).toBe(
      false,
    );
    expect(
      shouldShowPurchaseCampaignPromo({
        ...visible,
        campaign: { ...campaign, claimed: true },
      }),
    ).toBe(false);
    expect(
      shouldShowPurchaseCampaignPromo({
        ...visible,
        seenSlug: "usaf-birthday-2026",
      }),
    ).toBe(false);
    expect(
      shouldShowPurchaseCampaignPromo({ ...visible, optimisticSeen: true }),
    ).toBe(false);
  });

  it("shows again for a new campaign slug", () => {
    expect(
      shouldShowPurchaseCampaignPromo({
        ...visible,
        seenSlug: "veterans-day-2026",
      }),
    ).toBe(true);
  });
});
