import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://myepbuddy.com";

export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: "My EPBuddy | Air Force EPB Statement Generator",
    template: "%s | My EPBuddy",
  },
  description:
    "Personal productivity tool for Air Force service members to track accomplishments and draft EPB narrative statements. Not affiliated with the U.S. Government or Department of Defense. Designed to assist with AFI 36-2406 compliance.",
  keywords: [
    "Air Force",
    "EPB",
    "myEval",
    "Performance Brief",
    "Enlisted",
    "AFI 36-2406",
    "narrative statements",
    "accomplishment tracking",
    "NCO",
    "SNCO",
    "enlisted evaluation",
    "performance statement",
    "AI writing assistant",
    "productivity tool",
    "personal development",
  ],
  authors: [{ name: "My EPBuddy", url: siteUrl }],
  creator: "My EPBuddy",
  publisher: "My EPBuddy",
  
  // Additional classification metadata for enterprise proxies
  other: {
    "classification": "UNCLASSIFIED",
    "distribution": "Public",
    "government-affiliation": "None - Independent personal productivity tool",
  },
  
  // Canonical URL
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  
  // Open Graph
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "My EPBuddy",
    title: "My EPBuddy | Air Force EPB Statement Generator",
    description:
      "AI-powered tool to generate myEval-ready Enlisted Performance Brief statements. Track accomplishments, generate compliant narratives, and streamline your EPB process.",
    // The opengraph-image.tsx file will automatically be used
  },
  
  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "My EPBuddy | Air Force EPB Statement Generator",
    description:
      "AI-powered EPB statement generator for Air Force enlisted. Track accomplishments and generate myEval-ready narratives.",
    creator: "@myepbuddy",
    // The twitter-image.tsx file will automatically be used
  },
  
  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  
  // Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  
  // Manifest for PWA
  manifest: "/manifest.json",
  
  // App-specific
  applicationName: "My EPBuddy",
  category: "productivity",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} font-sans antialiased min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Analytics />
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

