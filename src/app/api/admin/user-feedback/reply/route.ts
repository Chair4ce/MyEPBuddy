import { NextRequest, NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/auth/require-admin";
import { escapeHtml, stripHtml } from "@/lib/email/html-safe";
import type { AdminUserFeedbackItem } from "@/lib/admin/user-feedback";

const MAX_REPLY_LENGTH = 5000;
const MAX_REPLIES_PER_HOUR = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const replyRateLimits = new Map<string, RateLimitRecord>();

function checkReplyRateLimit(adminId: string): boolean {
  const now = Date.now();
  const record = replyRateLimits.get(adminId);

  if (!record || now > record.resetAt) {
    replyRateLimits.set(adminId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_REPLIES_PER_HOUR) {
    return false;
  }

  record.count += 1;
  return true;
}

async function sendFeedbackReplyEmail(params: {
  toEmail: string;
  fromEmail: string;
  replyToEmail: string | null;
  resendApiKey: string;
  feature: string;
  originalFeedback: string;
  reply: string;
  submittedAtIso: string | null;
}) {
  const {
    toEmail,
    fromEmail,
    replyToEmail,
    resendApiKey,
    feature,
    originalFeedback,
    reply,
    submittedAtIso,
  } = params;

  const submittedLabel = submittedAtIso
    ? new Date(submittedAtIso).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "unknown date";

  const safeFeature = escapeHtml(feature);
  const safeSubmitted = escapeHtml(submittedLabel);
  const safeOriginal = escapeHtml(originalFeedback);
  const safeReply = escapeHtml(reply);

  const subject = `Re: Your MyEPBuddy feedback (${feature})`;
  const textBody = [
    "Thanks for sharing feedback with MyEPBuddy.",
    "",
    `Feature: ${feature}`,
    `Submitted: ${submittedLabel}`,
    "",
    "Your feedback:",
    originalFeedback,
    "",
    "Our reply:",
    reply,
    "",
    "— MyEPBuddy Support",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Thanks for sharing feedback with MyEPBuddy.</p>
      <p><strong>Feature:</strong> ${safeFeature}<br />
      <strong>Submitted:</strong> ${safeSubmitted}</p>
      <hr style="margin: 16px 0; border: none; border-top: 1px solid #ddd;" />
      <p style="margin: 0 0 8px 0;"><strong>Your feedback:</strong></p>
      <pre style="white-space: pre-wrap; margin: 0 0 16px 0; font-family: inherit; background: #f6f6f6; padding: 12px; border-radius: 6px;">${safeOriginal}</pre>
      <p style="margin: 0 0 8px 0;"><strong>Our reply:</strong></p>
      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit;">${safeReply}</pre>
      <p style="margin: 24px 0 0 0; color: #555;">— MyEPBuddy Support</p>
    </div>
  `;

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: [toEmail],
    subject,
    html: htmlBody,
    text: textBody,
  };
  if (replyToEmail) {
    payload.reply_to = replyToEmail;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email send failed: ${response.status} ${detail}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAdminApiUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!checkReplyRateLimit(auth.user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const feedbackId = typeof body.feedbackId === "string" ? body.feedbackId.trim() : "";
    const rawReply = typeof body.reply === "string" ? body.reply : "";
    const archive = body.archive === true;
    const reply = stripHtml(rawReply).trim().slice(0, MAX_REPLY_LENGTH);

    if (!feedbackId) {
      return NextResponse.json({ error: "feedbackId is required" }, { status: 400 });
    }
    if (!reply) {
      return NextResponse.json({ error: "Reply is required" }, { status: 400 });
    }

    const { data: existing, error: loadError } = await auth.supabase
      .from("user_feedback")
      .select(
        "id, user_id, user_email, feature, feedback, created_at, status, admin_reply, replied_at, replied_by, email_sent_at",
      )
      .eq("id", feedbackId)
      .maybeSingle();

    if (loadError) {
      console.error("[admin/user-feedback/reply] load error:", loadError.message);
      return NextResponse.json({ error: "Failed to load feedback" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const row = existing as Omit<AdminUserFeedbackItem, "user_name">;
    if (!row.user_email?.trim()) {
      return NextResponse.json(
        { error: "This feedback has no user email on file, so a reply cannot be emailed." },
        { status: 400 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FEEDBACK_FROM_EMAIL;
    const replyToEmail = process.env.FEEDBACK_NOTIFICATION_EMAIL ?? null;

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set RESEND_API_KEY and FEEDBACK_FROM_EMAIL on the server.",
        },
        { status: 503 },
      );
    }

    try {
      await sendFeedbackReplyEmail({
        toEmail: row.user_email.trim(),
        fromEmail,
        replyToEmail,
        resendApiKey,
        feature: row.feature,
        originalFeedback: row.feedback,
        reply,
        submittedAtIso: row.created_at,
      });
    } catch (emailError) {
      console.error("[admin/user-feedback/reply] email error:", emailError);
      return NextResponse.json(
        { error: "Failed to send reply email. Feedback was not marked as replied." },
        { status: 502 },
      );
    }

    const nowIso = new Date().toISOString();
    const nextStatus = archive ? "archived" : "replied";

    const { data: updated, error: updateError } = await auth.supabase
      .from("user_feedback")
      .update({
        admin_reply: reply,
        status: nextStatus,
        replied_at: nowIso,
        replied_by: auth.user.id,
        email_sent_at: nowIso,
      } as never)
      .eq("id", feedbackId)
      .select(
        "id, user_id, user_email, feature, feedback, created_at, status, admin_reply, replied_at, replied_by, email_sent_at",
      )
      .single();

    if (updateError || !updated) {
      console.error("[admin/user-feedback/reply] update error:", updateError?.message);
      return NextResponse.json(
        {
          error:
            "Email was sent, but saving the reply status failed. Refresh and check before sending again.",
        },
        { status: 500 },
      );
    }

    const item: AdminUserFeedbackItem = {
      ...(updated as Omit<AdminUserFeedbackItem, "user_name">),
      user_name: null,
    };

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("[admin/user-feedback/reply] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
