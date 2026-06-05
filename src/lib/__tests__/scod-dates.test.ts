import { describe, expect, it } from "vitest";
import {
  getCyclePeriodForYear,
  getStaticCloseoutDate,
  STATIC_CLOSEOUT_DATES,
} from "../constants";

/**
 * AFI 36-2406 Table 4.4 (RegAF) + day-after-prior-SCOD period rule.
 */
describe("enlisted SCOD dates", () => {
  it("SrA SCOD is 31 March with period 01-Apr through 31-Mar", () => {
    expect(STATIC_CLOSEOUT_DATES.airman).toEqual({
      month: 3,
      day: 31,
      label: "March 31",
    });
    expect(getStaticCloseoutDate("SrA")?.label).toBe("March 31");

    const period = getCyclePeriodForYear("SrA", 2026);
    expect(period?.rangeLabel).toBe("01-Apr-2025 to 31-Mar-2026");
    expect(period?.closeoutLabel).toBe("March 31");
  });

  it("SMSgt SCOD is 31 July with period 01-Aug through 31-Jul", () => {
    expect(STATIC_CLOSEOUT_DATES.smsgt).toEqual({
      month: 7,
      day: 31,
      label: "July 31",
    });
    expect(getStaticCloseoutDate("SMSgt")?.label).toBe("July 31");

    const period = getCyclePeriodForYear("SMSgt", 2026);
    expect(period?.rangeLabel).toBe("01-Aug-2025 to 31-Jul-2026");
    expect(period?.closeoutLabel).toBe("July 31");
  });

  it("CMSgt SCOD is 31 May with period 01-Jun through 31-May", () => {
    expect(STATIC_CLOSEOUT_DATES.cmsgt).toEqual({
      month: 5,
      day: 31,
      label: "May 31",
    });
    expect(getStaticCloseoutDate("CMSgt")?.label).toBe("May 31");

    const period = getCyclePeriodForYear("CMSgt", 2026);
    expect(period?.rangeLabel).toBe("01-Jun-2025 to 31-May-2026");
    expect(period?.closeoutLabel).toBe("May 31");
  });
});
