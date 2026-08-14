import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/email/html-safe";
import {
  buildReviewLinkEmail,
  type ReviewShellType,
} from "@/lib/email/review-link";
import {
  getResendApiKey,
  getTransactionalFromEmail,
  ResendSendError,
  sendResendEmail,
} from "@/lib/email/resend";

interface ProfileData {
  full_name: string | null;
  rank: string | null;
  email: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type RateLimitRecord = { count: number; resetAt: number };
const emailRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = emailRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    emailRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_EMAILS_PER_HOUR) {
    return false;
  }

  record.count += 1;
  return true;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://myepbuddy.com"
  );
}

function parseShellType(value: unknown): ReviewShellType {
  if (value === "award" || value === "decoration" || value === "epb") {
    return value;
  }
  return "epb";
}

function formatExpiresAt(iso: unknown): string {
  if (typeof iso !== "string" || !iso.trim()) return "soon";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// POST: Send review link via email (Resend). Link creation is separate —
// this route is best-effort delivery; callers should still show the link.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 10 emails per hour." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const token =
      typeof body.tokenId === "string"
        ? body.tokenId.trim()
        : typeof body.token === "string"
          ? body.token.trim()
          : "";
    const recipientEmail = stripHtml(
      typeof body.recipientEmail === "string" ? body.recipientEmail : ""
    )
      .trim()
      .toLowerCase();
    const reviewUrl =
      typeof body.reviewUrl === "string" ? body.reviewUrl.trim() : "";
    const rateeName = stripHtml(
      typeof body.rateeName === "string" ? body.rateeName : ""
    ).trim();
    const rateeRank =
      typeof body.rateeRank === "string"
        ? stripHtml(body.rateeRank).trim()
        : null;
    const mentorLabel =
      typeof body.mentorLabel === "string"
        ? stripHtml(body.mentorLabel).trim()
        : null;
    const shellType = parseShellType(body.shellType);
    const expiresAtLabel = formatExpiresAt(body.expiresAt);

    if (!token || !recipientEmail || !reviewUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(recipientEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Ensure the token belongs to the caller (public token string from create API).
    const { data: ownedToken, error: tokenLookupError } = await supabase
      .from("review_tokens")
      .select("id")
      .eq("token", token)
      .eq("created_by", user.id)
      .maybeSingle();

    if (tokenLookupError || !ownedToken) {
      return NextResponse.json(
        { error: "Review link not found" },
        { status: 404 }
      );
    }

    const { data: profile } = (await supabase
      .from("profiles")
      .select("full_name, rank, email")
      .eq("id", user.id)
      .single()) as { data: ProfileData | null; error: unknown };

    const senderDisplayName =
      [profile?.rank, profile?.full_name].filter(Boolean).join(" ").trim() ||
      "A MyEPBuddy user";

    const resendApiKey = getResendApiKey();
    const fromEmail = getTransactionalFromEmail();

    if (!resendApiKey || !fromEmail) {
      console.warn(
        "Review link email not sent — missing RESEND_API_KEY or EMAIL_FROM/FEEDBACK_FROM_EMAIL."
      );
      return NextResponse.json({
        success: true,
        emailSent: false,
        code: "email_not_configured",
        error:
          "Review link created, but email is not configured. Copy and share the link instead.",
      });
    }

    const emailContent = buildReviewLinkEmail({
      siteUrl: getSiteUrl(),
      senderDisplayName,
      rateeName: rateeName || "the ratee",
      rateeRank,
      mentorLabel,
      reviewUrl,
      expiresAt: expiresAtLabel,
      shellType,
    });

    try {
      await sendResendEmail({
        resendApiKey,
        from: fromEmail,
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        replyTo: (() => {
          const candidate = (profile?.email || user.email || "").trim();
          return candidate.includes("@") ? candidate : null;
        })(),
      });
    } catch (sendError) {
      const resendDetail =
        sendError instanceof ResendSendError
          ? { status: sendError.status, body: sendError.detail.slice(0, 500) }
          : {
              message:
                sendError instanceof Error ? sendError.message : "unknown",
            };
      console.error("Review link Resend error:", {
        from: fromEmail,
        to: recipientEmail,
        ...resendDetail,
      });
      return NextResponse.json({
        success: true,
        emailSent: false,
        code:
          sendError instanceof ResendSendError && sendError.status === 403
            ? "email_forbidden"
            : "email_send_failed",
        error:
          sendError instanceof ResendSendError && sendError.status === 403
            ? "Review link created, but email could not be delivered. Copy and share the link instead."
            : "Review link created, but the email provider failed to send. Copy and share the link instead.",
        resendStatus:
          sendError instanceof ResendSendError ? sendError.status : null,
      });
    }

    const { error: updateError } = await supabase
      .from("review_tokens")
      .update({
        recipient_email: recipientEmail,
        email_sent_at: new Date().toISOString(),
      } as never)
      .eq("id", (ownedToken as { id: string }).id)
      .eq("created_by", user.id);

    if (updateError) {
      console.error("Update token email metadata error:", updateError);
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
