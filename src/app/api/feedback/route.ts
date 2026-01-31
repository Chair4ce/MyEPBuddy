import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FeedbackResult {
  success: boolean;
  error?: string;
  message?: string;
  session_id?: string;
}

// POST: Submit mentor feedback (public - no auth required)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const body = await request.json();
    const {
      token,
      reviewerName,
      reviewerNameSource,
      comments,
    } = body;

    // Validate required fields
    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    if (!reviewerName) {
      return NextResponse.json(
        { error: "Reviewer name is required" },
        { status: 400 }
      );
    }

    if (!reviewerNameSource || !["label", "provided", "generated"].includes(reviewerNameSource)) {
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

    // Validate each comment has required fields
    for (const comment of comments) {
      if (!comment.section_key || !comment.comment_text) {
        return NextResponse.json(
          { error: "Each comment must have section_key and comment_text" },
          { status: 400 }
        );
      }
    }

    // Sanitize inputs to prevent XSS
    const sanitizedReviewerName = reviewerName.slice(0, 100).replace(/<[^>]*>/g, "");
    const sanitizedComments = comments.map((c: {
      section_key: string;
      original_text?: string;
      highlight_start?: number;
      highlight_end?: number;
      highlighted_text?: string;
      comment_text: string;
      suggestion?: string;
    }) => ({
      section_key: c.section_key?.slice(0, 50),
      original_text: c.original_text?.slice(0, 5000),
      highlight_start: typeof c.highlight_start === "number" ? c.highlight_start : null,
      highlight_end: typeof c.highlight_end === "number" ? c.highlight_end : null,
      highlighted_text: c.highlighted_text?.slice(0, 1000),
      comment_text: c.comment_text?.slice(0, 2000).replace(/<[^>]*>/g, ""),
      suggestion: c.suggestion?.slice(0, 2000).replace(/<[^>]*>/g, ""),
    }));

    // Call the secure function to submit feedback
    const rpcResult = await supabase.rpc("submit_mentor_feedback", {
      p_token: token,
      p_reviewer_name: sanitizedReviewerName,
      p_reviewer_name_source: reviewerNameSource,
      p_comments: sanitizedComments,
    } as never);

    if (rpcResult.error) {
      console.error("Feedback submission error:", rpcResult.error);
      return NextResponse.json(
        { error: "Failed to submit feedback" },
        { status: 500 }
      );
    }

    // The RPC returns a JSONB object
    const result = rpcResult.data as FeedbackResult;
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to submit feedback" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      sessionId: result.session_id,
    });
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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
