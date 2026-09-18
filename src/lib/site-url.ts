/** Production apex 307s to www; crawlers often fail image/canonical redirects. */
export const CANONICAL_SITE_HOST = "www.myepbuddy.com";
export const CANONICAL_SITE_URL = `https://${CANONICAL_SITE_HOST}`;

/**
 * Absolute public site origin for metadata, sitemap, and share cards.
 * Rewrites apex `myepbuddy.com` to `www` so og:url / og:image match the live host.
 */
export function canonicalSiteUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL
): string {
  const fallback = CANONICAL_SITE_URL;
  if (!raw?.trim()) return fallback;

  try {
    const url = new URL(raw);
    if (url.hostname === "myepbuddy.com") {
      url.hostname = CANONICAL_SITE_HOST;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}

export function canonicalPageUrl(
  path: string,
  raw?: string | undefined
): string {
  const origin = canonicalSiteUrl(raw);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return origin;
  return `${origin}${normalized}`;
}

/** Extensionless Next metadata image routes social crawlers fetch without cookies. */
export function isSocialPreviewPath(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.json" ||
    /^\/(?:apple-)?icon(?:-\d+x\d+)?(?:\.[a-z0-9]+)?$/i.test(pathname) ||
    /^\/(?:opengraph-image|twitter-image)(?:\.[a-z0-9]+)?$/i.test(pathname)
  );
}
