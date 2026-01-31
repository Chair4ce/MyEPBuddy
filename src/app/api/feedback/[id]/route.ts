import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FeedbackSession {
  id: string;
  user_id: string;
  review_token_id: string;
}

interface ReviewToken {
  content_snapshot: Record<string, unknown> | null;
}

// GET: Get comments for a feedback session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: sessionId } = await params;

    // Verify user owns this session and get the review token id
    const sessionResult = await supabase
      .from("feedback_sessions")
      .select("id, user_id, review_token_id")
      .eq("id", sessionId)
      .single();
    
    const session = sessionResult.data as FeedbackSession | null;
    const sessionError = sessionResult.error;

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get the content snapshot from the review token
    const { data: tokenData } = await supabase
      .from("review_tokens")
      .select("content_snapshot")
      .eq("id", session.review_token_id)
      .single();
    
    const reviewToken = tokenData as ReviewToken | null;

    // Get comments for this session
    const { data: comments, error } = await supabase
      .from("feedback_comments")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Fetch comments error:", error);
      return NextResponse.json(
        { error: "Failed to fetch comments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      comments,
      contentSnapshot: reviewToken?.content_snapshot || null,
    });
  } catch (error) {
    console.error("Comments fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update a comment status (accept/dismiss)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: commentId } = await params;
    const body = await request.json();
    const { status } = body;

    // Validate status
    if (!status || !["pending", "accepted", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status is required (pending, accepted, dismissed)" },
        { status: 400 }
      );
    }

    // Update the comment
    const { data: comment, error } = await supabase
      .from("feedback_comments")
      .update({
        status,
        resolved_at: status === "pending" ? null : new Date().toISOString(),
      } as never)
      .eq("id", commentId)
      .select()
      .single();

    if (error) {
      console.error("Update comment error:", error);
      return NextResponse.json(
        { error: "Failed to update comment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    console.error("Comment update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
