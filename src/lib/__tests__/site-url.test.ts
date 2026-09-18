import { describe, expect, it } from "vitest";
import {
  CANONICAL_SITE_URL,
  canonicalPageUrl,
  canonicalSiteUrl,
  isSocialPreviewPath,
} from "@/lib/site-url";

describe("canonicalSiteUrl", () => {
  it("defaults to the www host", () => {
    expect(canonicalSiteUrl(undefined)).toBe(CANONICAL_SITE_URL);
    expect(canonicalSiteUrl("")).toBe(CANONICAL_SITE_URL);
  });

  it("rewrites apex production URLs to www", () => {
    expect(canonicalSiteUrl("https://myepbuddy.com")).toBe(CANONICAL_SITE_URL);
    expect(canonicalSiteUrl("https://myepbuddy.com/")).toBe(CANONICAL_SITE_URL);
  });

  it("leaves www and localhost origins unchanged", () => {
    expect(canonicalSiteUrl("https://www.myepbuddy.com")).toBe(
      CANONICAL_SITE_URL
    );
    expect(canonicalSiteUrl("http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
  });
});

describe("canonicalPageUrl", () => {
  it("joins paths onto the canonical origin", () => {
    expect(canonicalPageUrl("/")).toBe(CANONICAL_SITE_URL);
    expect(canonicalPageUrl("privacy")).toBe(`${CANONICAL_SITE_URL}/privacy`);
    expect(canonicalPageUrl("/terms", "https://myepbuddy.com")).toBe(
      `${CANONICAL_SITE_URL}/terms`
    );
  });
});

describe("isSocialPreviewPath", () => {
  it("allows crawler metadata and card image routes", () => {
    expect(isSocialPreviewPath("/opengraph-image")).toBe(true);
    expect(isSocialPreviewPath("/opengraph-image.png")).toBe(true);
    expect(isSocialPreviewPath("/twitter-image")).toBe(true);
    expect(isSocialPreviewPath("/icon")).toBe(true);
    expect(isSocialPreviewPath("/robots.txt")).toBe(true);
    expect(isSocialPreviewPath("/sitemap.xml")).toBe(true);
    expect(isSocialPreviewPath("/manifest.json")).toBe(true);
  });

  it("does not open app pages", () => {
    expect(isSocialPreviewPath("/dashboard")).toBe(false);
    expect(isSocialPreviewPath("/login")).toBe(false);
    expect(isSocialPreviewPath("/icons/extra")).toBe(false);
  });
});
