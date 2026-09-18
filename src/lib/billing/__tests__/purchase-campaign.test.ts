import { describe, expect, it } from "vitest";
import {
  featuredSaleTokens,
  formatCampaignEndsAt,
  isCampaignWindowOpen,
  shouldGrantCampaignBonus,
  shouldStampCampaignOnCheckout,
} from "@/lib/billing/purchase-campaign";

const STARTS = new Date("2026-09-18T04:00:00.000Z");
const ENDS = new Date("2026-09-22T04:00:00.000Z");

describe("purchase campaign eligibility", () => {
  it("opens at start and closes at exclusive end", () => {
    expect(isCampaignWindowOpen(new Date(STARTS.getTime() - 1), STARTS, ENDS)).toBe(
      false,
    );
    expect(isCampaignWindowOpen(STARTS, STARTS, ENDS)).toBe(true);
    expect(isCampaignWindowOpen(new Date("2026-09-20T12:00:00.000Z"), STARTS, ENDS)).toBe(
      true,
    );
    expect(isCampaignWindowOpen(new Date("2026-09-21T16:00:00.000Z"), STARTS, ENDS)).toBe(
      true,
    );
    expect(isCampaignWindowOpen(ENDS, STARTS, ENDS)).toBe(false);
  });

  it("stamps checkout only while the window is open and unclaimed", () => {
    expect(shouldStampCampaignOnCheckout({ claimed: false, windowOpen: true })).toBe(
      true,
    );
    expect(shouldStampCampaignOnCheckout({ claimed: true, windowOpen: true })).toBe(
      false,
    );
    expect(shouldStampCampaignOnCheckout({ claimed: false, windowOpen: false })).toBe(
      false,
    );
  });

  it("grants from stamped metadata after the window closes", () => {
    expect(
      shouldGrantCampaignBonus({
        claimed: false,
        windowOpen: false,
        stampedSlug: "usaf-birthday-2026",
        campaignSlug: "usaf-birthday-2026",
      }),
    ).toBe(true);
  });

  it("grants an unstamped session that pays during the window", () => {
    expect(
      shouldGrantCampaignBonus({
        claimed: false,
        windowOpen: true,
        stampedSlug: null,
        campaignSlug: "usaf-birthday-2026",
      }),
    ).toBe(true);
  });

  it("never grants twice or for a different campaign stamp", () => {
    expect(
      shouldGrantCampaignBonus({
        claimed: true,
        windowOpen: true,
        stampedSlug: "usaf-birthday-2026",
        campaignSlug: "usaf-birthday-2026",
      }),
    ).toBe(false);
    expect(
      shouldGrantCampaignBonus({
        claimed: false,
        windowOpen: false,
        stampedSlug: "other-sale",
        campaignSlug: "usaf-birthday-2026",
      }),
    ).toBe(false);
  });

  it("keeps list-price math: 100 purchased + 400 bonus = 500", () => {
    expect(featuredSaleTokens(400)).toBe(500);
  });

  it("labels the last included Eastern day", () => {
    expect(formatCampaignEndsAt("2026-09-22T04:00:00.000Z")).toMatch(
      /Monday, September 21, 2026/,
    );
  });
});
