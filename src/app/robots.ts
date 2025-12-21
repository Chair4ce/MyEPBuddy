import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://myepbuddy.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/entries",
          "/generate",
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

