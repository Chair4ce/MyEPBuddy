"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccomplishmentCommentWithAuthor } from "@/types/database";

export async function getAccomplishmentComments(accomplishmentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("accomplishment_comments_with_author")
    .select("*")
    .eq("accomplishment_id", accomplishmentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Get accomplishment comments error:", error);
    return { error: error.message };
  }

  return { data: data as AccomplishmentCommentWithAuthor[] };
}

export async function createAccomplishmentComment(
  accomplishmentId: string,
  commentText: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("accomplishment_comments")
    .insert({
      accomplishment_id: accomplishmentId,
      author_id: user.id,
      comment_text: commentText,
    })
    .select()
    .single();

  if (error) {
    console.error("Create accomplishment comment error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { data };
}

export async function updateAccomplishmentComment(
  commentId: string,
  commentText: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("accomplishment_comments")
    .update({ comment_text: commentText })
    .eq("id", commentId)
    .select()
    .single();

  if (error) {
    console.error("Update accomplishment comment error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { data };
}

export async function resolveAccomplishmentComment(
  commentId: string,
  isResolved: boolean
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("accomplishment_comments")
    .update({
      is_resolved: isResolved,
      resolved_at: isResolved ? new Date().toISOString() : null,
      resolved_by: isResolved ? user.id : null,
    })
    .eq("id", commentId)
    .select()
    .single();

  if (error) {
    console.error("Resolve accomplishment comment error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { data };
}

export async function deleteAccomplishmentComment(commentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("accomplishment_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("Delete accomplishment comment error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

// Get comment counts for multiple accomplishments
export async function getAccomplishmentCommentCounts(accomplishmentIds: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase.rpc("get_accomplishment_comment_counts", {
    acc_ids: accomplishmentIds,
  });

  if (error) {
    console.error("Get comment counts error:", error);
    return { error: error.message };
  }

  // Convert to a map for easy lookup
  const counts: Record<string, { total: number; unresolved: number }> = {};
  (data || []).forEach(
    (row: { accomplishment_id: string; total_count: number; unresolved_count: number }) => {
      counts[row.accomplishment_id] = {
        total: row.total_count,
        unresolved: row.unresolved_count,
      };
    }
  );

  return { data: counts };
}

