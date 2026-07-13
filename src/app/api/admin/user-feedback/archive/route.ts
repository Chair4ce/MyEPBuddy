import { NextRequest, NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import type { AdminUserFeedbackItem } from "@/lib/admin/user-feedback";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAdminApiUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const feedbackId = typeof body.feedbackId === "string" ? body.feedbackId.trim() : "";

    if (!feedbackId) {
      return NextResponse.json({ error: "feedbackId is required" }, { status: 400 });
    }

    // Service role after admin gate — avoids RLS edge cases on UPDATE … RETURNING
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("user_feedback")
      .update({ status: "archived" })
      .eq("id", feedbackId)
      .select(
        "id, user_id, user_email, feature, feedback, created_at, status, admin_reply, replied_at, replied_by, email_sent_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[admin/user-feedback/archive] update error:", error.message);
      return NextResponse.json(
        { error: `Failed to archive feedback: ${error.message}` },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const item: AdminUserFeedbackItem = {
      ...(updated as Omit<AdminUserFeedbackItem, "user_name">),
      user_name: null,
    };

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("[admin/user-feedback/archive] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
