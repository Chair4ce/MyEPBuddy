import { describe, expect, it } from "vitest";
import {
  featuredSaleTokens,
  formatCampaignEndsAt,
  isCampaignWindowOpen,
  parseViewerTimeZone,
  shouldGrantCampaignBonus,
  shouldStampCampaignOnCheckout,
} from "@/lib/billing/purchase-campaign";

const STARTS = new Date("2026-09-18T00:00:00.000Z");
const ENDS = new Date("2026-09-22T00:00:00.000Z");
const NY = "America/New_York";
const PHOENIX = "America/Phoenix";
const PACIFIC = "America/Los_Angeles";
const HONOLULU = "Pacific/Honolulu";

/** Friday 00:00 ET / Thursday 21:00 Phoenix / Thursday 21:00 PT / Thursday 18:00 HST */
const ET_FRIDAY_MIDNIGHT = new Date("2026-09-18T04:00:00.000Z");
/** Friday 00:00 Phoenix and PT */
const PHOENIX_FRIDAY_MIDNIGHT = new Date("2026-09-18T07:00:00.000Z");
/** Friday 00:00 Honolulu */
const HONOLULU_FRIDAY_MIDNIGHT = new Date("2026-09-18T10:00:00.000Z");

describe("purchase campaign eligibility", () => {
  it("opens at local Friday midnight and closes at exclusive local Monday+ window end", () => {
    expect(
      isCampaignWindowOpen(new Date("2026-09-17T23:59:59.000Z"), STARTS, ENDS, NY),
    ).toBe(false);
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, NY)).toBe(true);
    expect(
      isCampaignWindowOpen(new Date("2026-09-20T12:00:00.000Z"), STARTS, ENDS, NY),
    ).toBe(true);
    expect(
      isCampaignWindowOpen(new Date("2026-09-21T16:00:00.000Z"), STARTS, ENDS, NY),
    ).toBe(true);
    expect(
      isCampaignWindowOpen(new Date("2026-09-22T04:00:00.000Z"), STARTS, ENDS, NY),
    ).toBe(false);
  });

  it("is open in Eastern and still Thursday (closed) in Phoenix at the same UTC instant", () => {
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, NY)).toBe(true);
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, PHOENIX)).toBe(
      false,
    );
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, PACIFIC)).toBe(
      false,
    );
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, HONOLULU)).toBe(
      false,
    );
  });

  it("opens later for western zones at their own local Friday midnight", () => {
    expect(
      isCampaignWindowOpen(PHOENIX_FRIDAY_MIDNIGHT, STARTS, ENDS, PHOENIX),
    ).toBe(true);
    expect(
      isCampaignWindowOpen(PHOENIX_FRIDAY_MIDNIGHT, STARTS, ENDS, PACIFIC),
    ).toBe(true);
    expect(
      isCampaignWindowOpen(PHOENIX_FRIDAY_MIDNIGHT, STARTS, ENDS, HONOLULU),
    ).toBe(false);
    expect(
      isCampaignWindowOpen(HONOLULU_FRIDAY_MIDNIGHT, STARTS, ENDS, HONOLULU),
    ).toBe(true);
  });

  it("stays open in Phoenix after Eastern exclusive end until Phoenix Monday 22 00:00", () => {
    const etClosedPhoenixOpen = new Date("2026-09-22T04:00:00.000Z");
    expect(isCampaignWindowOpen(etClosedPhoenixOpen, STARTS, ENDS, NY)).toBe(
      false,
    );
    expect(isCampaignWindowOpen(etClosedPhoenixOpen, STARTS, ENDS, PHOENIX)).toBe(
      true,
    );
    expect(
      isCampaignWindowOpen(new Date("2026-09-22T07:00:00.000Z"), STARTS, ENDS, PHOENIX),
    ).toBe(false);
  });

  it("treats stored ET or Phoenix midnights as the same Friday civil start date", () => {
    const etEncodedStart = new Date("2026-09-18T04:00:00.000Z");
    const phoenixEncodedStart = new Date("2026-09-18T07:00:00.000Z");
    const encodedEnd = new Date("2026-09-22T04:00:00.000Z");
    expect(
      isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, etEncodedStart, encodedEnd, NY),
    ).toBe(true);
    expect(
      isCampaignWindowOpen(
        ET_FRIDAY_MIDNIGHT,
        phoenixEncodedStart,
        encodedEnd,
        PHOENIX,
      ),
    ).toBe(false);
    expect(
      isCampaignWindowOpen(
        PHOENIX_FRIDAY_MIDNIGHT,
        phoenixEncodedStart,
        encodedEnd,
        PHOENIX,
      ),
    ).toBe(true);
  });

  it("fails closed without a valid IANA timezone", () => {
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, null)).toBe(
      false,
    );
    expect(isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, "")).toBe(
      false,
    );
    expect(
      isCampaignWindowOpen(ET_FRIDAY_MIDNIGHT, STARTS, ENDS, "Not/AZone"),
    ).toBe(false);
    expect(parseViewerTimeZone("America/Phoenix")).toBe("America/Phoenix");
    expect(parseViewerTimeZone("America/New_York; DROP")).toBe(null);
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

  it("labels the last included local day in the viewer's timezone", () => {
    expect(formatCampaignEndsAt("2026-09-22T00:00:00.000Z", NY)).toMatch(
      /Monday, September 21, 2026/,
    );
    expect(formatCampaignEndsAt("2026-09-22T00:00:00.000Z", PHOENIX)).toMatch(
      /Monday, September 21, 2026/,
    );
    expect(formatCampaignEndsAt("2026-09-22T04:00:00.000Z", NY)).toMatch(
      /Monday, September 21, 2026/,
    );
  });
});
