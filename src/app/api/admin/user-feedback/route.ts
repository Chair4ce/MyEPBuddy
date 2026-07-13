import { NextRequest, NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/auth/require-admin";
import {
  isUserFeedbackStatus,
  type AdminUserFeedbackItem,
  type UserFeedbackStatus,
} from "@/lib/admin/user-feedback";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status") ?? "open";
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  let query = auth.supabase
    .from("user_feedback")
    .select(
      "id, user_id, user_email, feature, feedback, created_at, status, admin_reply, replied_at, replied_by, email_sent_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusParam !== "all") {
    if (!isUserFeedbackStatus(statusParam)) {
      return NextResponse.json(
        { error: "Invalid status filter. Use open, replied, archived, or all." },
        { status: 400 },
      );
    }
    query = query.eq("status", statusParam);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/user-feedback] list error:", error.message);
    return NextResponse.json({ error: "Failed to load feedback" }, { status: 500 });
  }

  const rows = (data ?? []) as Omit<AdminUserFeedbackItem, "user_name">[];
  const userIds = [
    ...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
  ];

  const nameById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await auth.supabase
      .from("profiles")
      .select("id, full_name, first_name, email")
      .in("id", userIds);

    for (const profile of (profiles ?? []) as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      email: string | null;
    }>) {
      nameById.set(
        profile.id,
        profile.full_name?.trim() || profile.first_name?.trim() || profile.email || null,
      );
    }
  }

  const items: AdminUserFeedbackItem[] = rows.map((row) => ({
    ...row,
    status: (row.status as UserFeedbackStatus) ?? "open",
    user_name: row.user_id ? nameById.get(row.user_id) ?? null : null,
  }));

  return NextResponse.json({ items });
}
