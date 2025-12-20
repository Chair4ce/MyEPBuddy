import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface VersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  commitHash?: string;
}

// Cache the version info in memory (read once at startup)
let cachedVersion: VersionInfo | null = null;

function getVersionInfo(): VersionInfo | null {
  if (cachedVersion) return cachedVersion;
  
  try {
    const versionPath = path.join(process.cwd(), "public", "version.json");
    const content = fs.readFileSync(versionPath, "utf8");
    cachedVersion = JSON.parse(content);
    return cachedVersion;
  } catch {
    // Version file doesn't exist yet (first deploy)
    return null;
  }
}

export async function GET(request: Request) {
  const versionInfo = getVersionInfo();
  
  if (!versionInfo) {
    return NextResponse.json(
      { error: "Version info not available" },
      { status: 404 }
    );
  }
  
  // Use buildId as ETag for efficient caching
  const etag = `"${versionInfo.buildId}"`;
  
  // Check If-None-Match header for conditional requests
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    // Client already has the latest version - return 304 Not Modified
    // This is extremely lightweight (no body transferred)
    return new NextResponse(null, {
      status: 304,
      headers: {
        "ETag": etag,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  }
  
  // Return version info with proper caching headers
  return NextResponse.json(versionInfo, {
    headers: {
      "ETag": etag,
      // Allow CDN/browser caching for 60s, serve stale for 5 min while revalidating
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      // Ensure CDN can cache but still respects ETag
      "Vary": "Accept-Encoding",
    },
  });
}

