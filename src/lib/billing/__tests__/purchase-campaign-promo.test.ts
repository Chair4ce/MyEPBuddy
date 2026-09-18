import { describe, expect, it } from "vitest";
import {
  shouldDeferOptionalLoginIntros,
  shouldShowPurchaseCampaignPromo,
} from "@/lib/billing/purchase-campaign-promo";
import type { PurchaseCampaignOffer } from "@/lib/billing/purchase-campaign";

const campaign: PurchaseCampaignOffer = {
  slug: "usaf-birthday-2026",
  title: "Air Force Birthday weekend",
  subtitle: "Bonus tokens",
  bonusCredits: 400,
  startsAt: "2026-09-18T00:00:00.000Z",
  endsAt: "2026-09-22T00:00:00.000Z",
  claimed: false,
};

const visible = {
  termsAccepted: true,
  creditsLoading: false,
  hasOwnKey: false,
  campaign,
  seenSlug: null as string | null,
};

describe("shouldShowPurchaseCampaignPromo", () => {
  it("shows once when the campaign is live and unseen", () => {
    expect(shouldShowPurchaseCampaignPromo(visible)).toBe(true);
  });

  it("waits for terms, required onboarding, and credits", () => {
    expect(
      shouldShowPurchaseCampaignPromo({ ...visible, termsAccepted: false }),
    ).toBe(false);
    expect(
      shouldShowPurchaseCampaignPromo({
        ...visible,
        requiredOnboardingComplete: false,
      }),
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

describe("shouldDeferOptionalLoginIntros", () => {
  it("defers while credits are loading so other intros cannot flash first", () => {
    expect(
      shouldDeferOptionalLoginIntros({ creditsLoading: true, campaign: null }),
    ).toBe(true);
  });

  it("defers for the whole campaign window, even after the promo is claimed", () => {
    expect(
      shouldDeferOptionalLoginIntros({
        creditsLoading: false,
        campaign: { ...campaign, claimed: true },
      }),
    ).toBe(true);
  });

  it("always defers optional feature intros while AUTO_FEATURE_LOGIN_INTROS_ENABLED is off", () => {
    expect(
      shouldDeferOptionalLoginIntros({ creditsLoading: false, campaign: null }),
    ).toBe(true);
  });
});
