import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/stripe/server";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_PORTAL_ATTEMPTS = 10;

type RateLimitRecord = { count: number; resetAt: number };
const portalRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = portalRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    portalRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_PORTAL_ATTEMPTS) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 },
    );
  }

  try {
    const url = await createBillingPortalSession(user.id);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[billing/portal]", error);
    const message =
      error instanceof Error ? error.message : "Unable to open billing portal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
