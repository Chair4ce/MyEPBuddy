import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface VersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  commitHash?: string;
}

// Read version.json fresh each time to ensure we always return the latest
// This is important for serverless environments where instances may be stale
function getVersionInfo(): VersionInfo | null {
  try {
    const versionPath = path.join(process.cwd(), "public", "version.json");
    const content = fs.readFileSync(versionPath, "utf8");
    return JSON.parse(content);
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
  
  // Use buildId as ETag for efficient conditional requests
  const etag = `"${versionInfo.buildId}"`;
  
  // Check If-None-Match header for conditional requests
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    // Client already has the latest version - return 304 Not Modified
    return new NextResponse(null, {
      status: 304,
      headers: {
        "ETag": etag,
        // No caching - always revalidate to ensure fresh version info
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
  
  // Return version info with no-cache to prevent stale version detection
  // The polling is already infrequent (15 min), so no need for browser caching
  return NextResponse.json(versionInfo, {
    headers: {
      "ETag": etag,
      // No browser/CDN caching - always get fresh version from server
      // This prevents the issue where stale cache causes repeated update prompts
      "Cache-Control": "no-store, max-age=0",
      "Vary": "Accept-Encoding",
    },
  });
}

