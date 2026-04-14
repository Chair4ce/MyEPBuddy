import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_FEEDBACK_LENGTH = 2000;
const MAX_SUBMISSIONS_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const feedbackRateLimits = new Map<string, RateLimitRecord>();

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = feedbackRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    feedbackRateLimits.set(userId, {
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

async function sendFeedbackNotificationEmail(params: {
  supportEmail: string;
  fromEmail: string;
  resendApiKey: string;
  userEmail: string;
  userId: string;
  feature: string;
  feedback: string;
  submittedAtIso: string;
}) {
  const {
    supportEmail,
    fromEmail,
    resendApiKey,
    userEmail,
    userId,
    feature,
    feedback,
    submittedAtIso,
  } = params;

  const formattedDate = new Date(submittedAtIso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const safeUserEmail = escapeHtml(userEmail);
  const safeUserId = escapeHtml(userId);
  const safeFeature = escapeHtml(feature);
  const safeFormattedDate = escapeHtml(formattedDate);
  const safeFeedback = escapeHtml(feedback);

  const subject = `[MyEPBuddy Feedback] ${feature}`;
  const textBody = [
    "New feedback submission from MyEPBuddy",
    "",
    `From user email: ${userEmail}`,
    `User ID: ${userId}`,
    `Feature: ${feature}`,
    `Submitted at: ${formattedDate}`,
    "",
    "Feedback:",
    feedback,
  ].join("\n");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 16px 0;">New MyEPBuddy Feedback</h2>
      <p><strong>From user email:</strong> ${safeUserEmail}</p>
      <p><strong>User ID:</strong> ${safeUserId}</p>
      <p><strong>Feature:</strong> ${safeFeature}</p>
      <p><strong>Submitted at:</strong> ${safeFormattedDate}</p>
      <hr style="margin: 16px 0; border: none; border-top: 1px solid #ddd;" />
      <p style="margin: 0 0 8px 0;"><strong>Feedback:</strong></p>
      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit;">${safeFeedback}</pre>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [supportEmail],
      subject,
      html: htmlBody,
      text: textBody,
      reply_to: userEmail,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email send failed: ${response.status} ${detail}`);
  }
}

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
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const rawFeedback = typeof body.feedback === "string" ? body.feedback : "";
    const rawFeature = typeof body.feature === "string" ? body.feature : "general";

    const feedback = stripHtml(rawFeedback).trim().slice(0, MAX_FEEDBACK_LENGTH);
    const feature = stripHtml(rawFeature).trim().slice(0, 50) || "general";

    if (!feedback) {
      return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("user_feedback")
      .insert({
        user_id: user.id,
        feature,
        feedback,
      } as never);

    if (insertError) {
      console.error("Failed to insert user feedback:", insertError);
      return NextResponse.json(
        { error: "Failed to submit feedback" },
        { status: 500 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const supportEmail = process.env.FEEDBACK_NOTIFICATION_EMAIL;
    const fromEmail = process.env.FEEDBACK_FROM_EMAIL;

    if (resendApiKey && supportEmail && fromEmail && user.email) {
      try {
        await sendFeedbackNotificationEmail({
          supportEmail,
          fromEmail,
          resendApiKey,
          userEmail: user.email,
          userId: user.id,
          feature,
          feedback,
          submittedAtIso: new Date().toISOString(),
        });
      } catch (emailError) {
        // Keep feedback submit successful even if email delivery fails.
        console.error("Failed to send feedback notification email:", emailError);
      }
    } else {
      console.warn(
        "Feedback email not sent - missing RESEND_API_KEY, FEEDBACK_NOTIFICATION_EMAIL, FEEDBACK_FROM_EMAIL, or user email.",
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected feedback submit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
