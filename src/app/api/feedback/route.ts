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
      if (!comment.sectionKey || !comment.commentText) {
        return NextResponse.json(
          { error: "Each comment must have sectionKey and commentText" },
          { status: 400 }
        );
      }
    }

    // Sanitize inputs to prevent XSS
    const sanitizedReviewerName = reviewerName.slice(0, 100).replace(/<[^>]*>/g, "");
    const sanitizedComments = comments.map((c: {
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
      highlightStart: typeof c.highlightStart === "number" ? c.highlightStart : null,
      highlightEnd: typeof c.highlightEnd === "number" ? c.highlightEnd : null,
      highlightedText: c.highlightedText?.slice(0, 1000),
      commentText: c.commentText?.slice(0, 2000).replace(/<[^>]*>/g, ""),
      suggestion: c.suggestion?.slice(0, 2000).replace(/<[^>]*>/g, ""),
      suggestionType: c.suggestionType && ["comment", "replace", "delete"].includes(c.suggestionType) 
        ? c.suggestionType 
        : "comment",
      replacementText: c.replacementText?.slice(0, 2000).replace(/<[^>]*>/g, ""),
      isFullRewrite: c.isFullRewrite === true,
      rewriteText: c.rewriteText?.slice(0, 5000).replace(/<[^>]*>/g, ""),
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
      // Check for specific error messages
      const errorMessage = rpcResult.error.message || "Failed to submit feedback";
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    // The RPC now returns a UUID (session_id) directly, or JSONB for older versions
    const result = rpcResult.data;
    
    // Handle both old JSONB format and new UUID format
    if (typeof result === "string") {
      // New format: returns UUID directly
      return NextResponse.json({
        success: true,
        message: "Feedback submitted successfully",
        sessionId: result,
      });
    } else if (result && typeof result === "object") {
      // Old JSONB format for backwards compatibility
      const jsonResult = result as FeedbackResult;
      if (!jsonResult.success) {
        return NextResponse.json(
          { error: jsonResult.error || "Failed to submit feedback" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        message: jsonResult.message,
        sessionId: jsonResult.session_id,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Feedback submitted successfully",
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
