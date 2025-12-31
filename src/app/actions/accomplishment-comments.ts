"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccomplishmentCommentWithAuthor, ChainMember } from "@/types/database";

export async function getAccomplishmentComments(accomplishmentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Query table directly with joins instead of using a view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("accomplishment_comments")
    .select(`
      *,
      author:profiles!accomplishment_comments_author_id_fkey(full_name, rank, avatar_url),
      resolved_by_profile:profiles!accomplishment_comments_resolved_by_fkey(full_name, rank),
      recipient:profiles!accomplishment_comments_recipient_id_fkey(full_name, rank)
    `)
    .eq("accomplishment_id", accomplishmentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Get accomplishment comments error:", error);
    return { error: error.message };
  }

  // Transform the nested data to match AccomplishmentCommentWithAuthor interface
  const transformedData: AccomplishmentCommentWithAuthor[] = (data || []).map((comment: {
    id: string;
    accomplishment_id: string;
    author_id: string;
    comment_text: string;
    is_resolved: boolean;
    resolved_at: string | null;
    resolved_by: string | null;
    recipient_id: string | null;
    created_at: string;
    updated_at: string;
    author: { full_name: string | null; rank: string | null; avatar_url: string | null } | null;
    resolved_by_profile: { full_name: string | null; rank: string | null } | null;
    recipient: { full_name: string | null; rank: string | null } | null;
  }) => ({
    id: comment.id,
    accomplishment_id: comment.accomplishment_id,
    author_id: comment.author_id,
    comment_text: comment.comment_text,
    is_resolved: comment.is_resolved,
    resolved_at: comment.resolved_at,
    resolved_by: comment.resolved_by,
    recipient_id: comment.recipient_id,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    author_name: comment.author?.full_name || null,
    author_rank: comment.author?.rank || null,
    author_avatar_url: comment.author?.avatar_url || null,
    resolved_by_name: comment.resolved_by_profile?.full_name || null,
    resolved_by_rank: comment.resolved_by_profile?.rank || null,
    recipient_name: comment.recipient?.full_name || null,
    recipient_rank: comment.recipient?.rank || null,
  }));

  return { data: transformedData };
}

export async function createAccomplishmentComment(
  accomplishmentId: string,
  commentText: string,
  recipientId?: string | null
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
      recipient_id: recipientId || null,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_accomplishment_comment_counts", {
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

// Get chain members for private comment recipient selection
export async function getAccomplishmentChainMembers(accomplishmentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_accomplishment_chain_members", {
    acc_id: accomplishmentId,
  });

  if (error) {
    console.error("Get chain members error:", error);
    return { error: error.message };
  }

  return { data: data as ChainMember[] };
}

