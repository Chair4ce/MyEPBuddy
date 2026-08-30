import type { MetadataRoute } from "next";
import { canonicalSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = canonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/entries",
          "/epb",
          "/team",
          "/library",
          "/settings",
          "/admin",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

