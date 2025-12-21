import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Local Supabase URLs for development
const localSupabaseUrls = isDev
  ? "http://127.0.0.1:54321 http://localhost:54321 ws://127.0.0.1:54321 ws://localhost:54321"
  : "";

// Security headers to protect against common attacks
// These headers help establish trust with enterprise/government proxies
const securityHeaders = [
  {
    // Content Security Policy - Restricts where resources can be loaded from
    // Essential for DoD/government proxy trust
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://*.supabase.co https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://va.vercel-scripts.com wss://*.supabase.co ${localSupabaseUrls}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      isDev ? "" : "upgrade-insecure-requests",
    ].filter(Boolean).join("; "),
  },
  {
    // Prevent clickjacking by disallowing framing
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Prevent MIME type sniffing
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Enable XSS filtering (legacy browsers)
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    // Control referrer information sent with requests
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Restrict browser features and APIs
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // Force HTTPS for all future requests (1 year)
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    // Cross-Origin policies for additional security
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    // Prevent cross-origin resource timing attacks
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  // Apply security headers to all routes
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

