import { describe, expect, it } from "vitest";
import { detectRestrictedBrowser } from "../restricted-browser";

describe("detectRestrictedBrowser", () => {
  it("treats standalone as this app", () => {
    expect(
      detectRestrictedBrowser({ userAgent: "", isStandalone: true })
    ).toEqual({ restricted: true, browserName: "this app" });
  });

  it("detects Instagram", () => {
    expect(
      detectRestrictedBrowser({
        userAgent: "Mozilla/5.0 Instagram 123.0",
        isStandalone: false,
      })
    ).toEqual({ restricted: true, browserName: "Instagram" });
  });

  it("detects LinkedIn", () => {
    expect(
      detectRestrictedBrowser({
        userAgent: "LinkedInApp/1.0",
        isStandalone: false,
      })
    ).toEqual({ restricted: true, browserName: "LinkedIn" });
  });

  it("detects Facebook FBAN", () => {
    expect(
      detectRestrictedBrowser({
        userAgent: "Mozilla/5.0 FBAN/FBIOS",
        isStandalone: false,
      })
    ).toEqual({ restricted: true, browserName: "Facebook" });
  });

  it("returns unrestricted for normal desktop UA", () => {
    expect(
      detectRestrictedBrowser({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
        isStandalone: false,
      })
    ).toEqual({ restricted: false, browserName: "" });
  });

  it("prefers standalone over Instagram UA", () => {
    expect(
      detectRestrictedBrowser({
        userAgent: "Mozilla/5.0 Instagram 123.0",
        isStandalone: true,
      })
    ).toEqual({ restricted: true, browserName: "this app" });
  });

  it("is pure for identical inputs", () => {
    const input = {
      userAgent: "Mozilla/5.0 Instagram 1",
      isStandalone: false,
    };
    const a = detectRestrictedBrowser(input);
    const b = detectRestrictedBrowser(input);
    expect(a).toEqual(b);
    expect(a.restricted).toBe(b.restricted);
    expect(a.browserName).toBe(b.browserName);
  });
});
