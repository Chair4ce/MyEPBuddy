import { NextResponse } from "next/server";
import { runModelCatalogSync } from "@/lib/ai-models/run-catalog-sync";
import { acquireCatalogSyncLock } from "@/lib/ai-models/sync-lock";

export const maxDuration = 120;

function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lock = await acquireCatalogSyncLock(null);
  if (!lock.acquired) {
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: lock.error,
        retryAfterMinutes: lock.retryAfterMinutes,
      },
      { status: 429 },
    );
  }

  const result = await runModelCatalogSync();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
