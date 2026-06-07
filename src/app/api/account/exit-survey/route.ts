import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isValidExitReason,
  sanitizeComments,
} from "@/lib/account-deletion";

const MAX_SUBMISSIONS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const surveyRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = surveyRateLimits.get(key);

  if (!record || now > record.resetAt) {
    surveyRateLimits.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_SUBMISSIONS_PER_HOUR) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const rawReason = typeof body.reason === "string" ? body.reason.trim() : null;
    const comments = sanitizeComments(
      typeof body.comments === "string" ? body.comments : null,
    );

    if (!token) {
      return NextResponse.json({ error: "Invalid survey token" }, { status: 400 });
    }

    const reason = isValidExitReason(rawReason) ? rawReason : null;

    if (!reason && !comments) {
      return NextResponse.json(
        { error: "Please select a reason or share a comment." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const adminClient = admin as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { token: string; expires_at: string; used_at: string | null } | null;
              error: unknown;
            }>;
          };
        };
        insert: (row: Record<string, string | null>) => Promise<{ error: { message: string } | null }>;
        update: (row: Record<string, string>) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };

    const { data: tokenRow, error: tokenError } = await adminClient
      .from("account_exit_survey_tokens")
      .select("token, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: "Invalid or expired survey link" }, { status: 400 });
    }

    if (tokenRow.used_at) {
      return NextResponse.json({ error: "Survey already submitted" }, { status: 400 });
    }

    if (tokenRow.expires_at < now) {
      return NextResponse.json({ error: "Survey link has expired" }, { status: 400 });
    }

    const { error: surveyError } = await adminClient.from("account_exit_surveys").insert({
      reason,
      comments,
      source: "goodbye_page",
    });

    if (surveyError) {
      console.error("Failed to save goodbye page exit survey:", surveyError);
      return NextResponse.json({ error: "Failed to submit survey" }, { status: 500 });
    }

    const { error: markUsedError } = await adminClient
      .from("account_exit_survey_tokens")
      .update({ used_at: now })
      .eq("token", token)
      .is("used_at", null);

    if (markUsedError) {
      console.error("Failed to mark survey token as used:", markUsedError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected exit survey error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
