import { describe, expect, it } from "vitest";
import { config } from "../../../middleware";

const matcher = config.matcher[0];
if (typeof matcher !== "string") {
  throw new Error("expected string middleware matcher");
}

function matches(pathname: string): boolean {
  const re = new RegExp(`^${matcher}$`);
  return re.test(pathname);
}

describe("middleware matcher", () => {
  it("skips signed webhook routes so getUser does not delay Svix", () => {
    expect(matches("/api/webhooks/resend")).toBe(false);
    expect(matches("/api/billing/webhook")).toBe(false);
  });

  it("still runs on app pages and other APIs", () => {
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/api/analytics")).toBe(true);
  });

  it("skips social-preview and crawler metadata routes", () => {
    expect(matches("/opengraph-image")).toBe(false);
    expect(matches("/twitter-image")).toBe(false);
    expect(matches("/icon")).toBe(false);
    expect(matches("/robots.txt")).toBe(false);
    expect(matches("/sitemap.xml")).toBe(false);
    expect(matches("/manifest.json")).toBe(false);
  });
});
