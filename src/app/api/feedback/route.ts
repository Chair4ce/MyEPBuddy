import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { buildMentorFeedbackReceivedEmail } from "@/lib/email/mentor-feedback-received";
import type { ReviewShellType } from "@/lib/email/review-link";
import {
  getResendApiKey,
  getTransactionalFromEmail,
  sendResendEmail,
} from "@/lib/email/resend";

interface FeedbackResult {
  success: boolean;
  error?: string;
  message?: string;
  session_id?: string;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://myepbuddy.com"
  );
}

function parseShellType(value: string | null | undefined): ReviewShellType {
  if (value === "award" || value === "decoration" || value === "epb") {
    return value;
  }
  return "epb";
}

function appPathForShell(shellType: ReviewShellType): string {
  if (shellType === "award") return "/award";
  if (shellType === "decoration") return "/decoration";
  return "/generate";
}

/** Best-effort Resend notify to the package owner. Never fails the submit. */
async function notifyOwnerOfFeedback(params: {
  token: string;
  reviewerName: string;
  commentCount: number;
}): Promise<void> {
  const resendApiKey = getResendApiKey();
  const fromEmail = getTransactionalFromEmail();
  if (!resendApiKey || !fromEmail) {
    console.warn(
      "Mentor feedback submitted but owner email not sent — missing RESEND_API_KEY or EMAIL_FROM/FEEDBACK_FROM_EMAIL."
    );
    return;
  }

  try {
    const admin = createAdminClient();
    const { data: tokenRow, error: tokenError } = await admin
      .from("review_tokens")
      .select("created_by, shell_type, ratee_name, ratee_rank")
      .eq("token", params.token)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      console.warn("Mentor feedback notify: token lookup failed", tokenError);
      return;
    }

    const row = tokenRow as {
      created_by: string;
      shell_type: string;
      ratee_name: string;
      ratee_rank: string | null;
    };

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email, full_name, first_name")
      .eq("id", row.created_by)
      .maybeSingle();

    if (profileError || !profile) {
      console.warn("Mentor feedback notify: profile lookup failed", profileError);
      return;
    }

    const owner = profile as {
      email: string | null;
      full_name: string | null;
      first_name: string | null;
    };
    const to = (owner.email || "").trim();
    if (!to.includes("@")) {
      console.warn("Mentor feedback notify: owner has no email");
      return;
    }

    const shellType = parseShellType(row.shell_type);
    const emailContent = buildMentorFeedbackReceivedEmail({
      siteUrl: getSiteUrl(),
      recipientName: owner.first_name || owner.full_name,
      reviewerName: params.reviewerName,
      rateeName: row.ratee_name,
      rateeRank: row.ratee_rank,
      shellType,
      commentCount: params.commentCount,
      appPath: appPathForShell(shellType),
    });

    await sendResendEmail({
      resendApiKey,
      from: fromEmail,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (err) {
    console.error("Mentor feedback owner notify failed:", err);
  }
}

// POST: Submit mentor feedback (public - no auth required)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const body = await request.json();
    const { token, reviewerName, reviewerNameSource, comments } = body;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    if (!reviewerName) {
      return NextResponse.json(
        { error: "Reviewer name is required" },
        { status: 400 }
      );
    }

    if (
      !reviewerNameSource ||
      !["label", "provided", "generated"].includes(reviewerNameSource)
    ) {
      return NextResponse.json(
        { error: "Valid reviewer name source is required" },
        { status: 400 }
      );
    }

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return NextResponse.json(
        { error: "At least one comment is required" },
        { status: 400 }
      );
    }

    for (const comment of comments) {
      if (!comment.sectionKey || !comment.commentText) {
        return NextResponse.json(
          { error: "Each comment must have sectionKey and commentText" },
          { status: 400 }
        );
      }
    }

    const sanitizedReviewerName = reviewerName
      .slice(0, 100)
      .replace(/<[^>]*>/g, "");
    const sanitizedComments = comments.map(
      (c: {
        sectionKey: string;
        sectionLabel?: string;
        originalText?: string;
        highlightStart?: number;
        highlightEnd?: number;
        highlightedText?: string;
        commentText: string;
        suggestion?: string;
        suggestionType?: string;
        replacementText?: string;
        isFullRewrite?: boolean;
        rewriteText?: string;
      }) => ({
        sectionKey: c.sectionKey?.slice(0, 50),
        sectionLabel: c.sectionLabel?.slice(0, 100),
        originalText: c.originalText?.slice(0, 5000),
        highlightStart:
          typeof c.highlightStart === "number" ? c.highlightStart : null,
        highlightEnd:
          typeof c.highlightEnd === "number" ? c.highlightEnd : null,
        highlightedText: c.highlightedText?.slice(0, 1000),
        commentText: c.commentText?.slice(0, 2000).replace(/<[^>]*>/g, ""),
        suggestion: c.suggestion?.slice(0, 2000).replace(/<[^>]*>/g, ""),
        suggestionType:
          c.suggestionType &&
          ["comment", "replace", "delete"].includes(c.suggestionType)
            ? c.suggestionType
            : "comment",
        replacementText: c.replacementText
          ?.slice(0, 2000)
          .replace(/<[^>]*>/g, ""),
        isFullRewrite: c.isFullRewrite === true,
        rewriteText: c.rewriteText?.slice(0, 5000).replace(/<[^>]*>/g, ""),
      })
    );

    const rpcResult = await supabase.rpc("submit_mentor_feedback", {
      p_token: token,
      p_reviewer_name: sanitizedReviewerName,
      p_reviewer_name_source: reviewerNameSource,
      p_comments: sanitizedComments,
    } as never);

    if (rpcResult.error) {
      console.error("Feedback submission error:", rpcResult.error);
      const errorMessage =
        rpcResult.error.message || "Failed to submit feedback";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const result = rpcResult.data;
    let successPayload: {
      success: true;
      message?: string;
      sessionId?: string;
    };

    if (typeof result === "string") {
      successPayload = {
        success: true,
        message: "Feedback submitted successfully",
        sessionId: result,
      };
    } else if (result && typeof result === "object") {
      const jsonResult = result as FeedbackResult;
      if (!jsonResult.success) {
        return NextResponse.json(
          { error: jsonResult.error || "Failed to submit feedback" },
          { status: 400 }
        );
      }
      successPayload = {
        success: true,
        message: jsonResult.message,
        sessionId: jsonResult.session_id,
      };
    } else {
      successPayload = {
        success: true,
        message: "Feedback submitted successfully",
      };
    }

    // Fire-and-forget owner email via Resend (does not block / fail submit)
    void notifyOwnerOfFeedback({
      token: typeof token === "string" ? token : String(token),
      reviewerName: sanitizedReviewerName,
      commentCount: sanitizedComments.length,
    });

    return NextResponse.json(successPayload);
  } catch (error) {
    console.error("Feedback submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get feedback sessions for a shell (authenticated)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shellType = searchParams.get("shellType");
    const shellId = searchParams.get("shellId");

    let query = supabase
      .from("feedback_sessions_view")
      .select("*")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (shellType) {
      query = query.eq("shell_type", shellType);
    }
    if (shellId) {
      query = query.eq("shell_id", shellId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error("Fetch sessions error:", error);
      return NextResponse.json(
        { error: "Failed to fetch feedback sessions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Feedback sessions fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
