"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupervisorFeedback, FeedbackType } from "@/types/database";

/**
 * Get all feedbacks for a specific subordinate/team member
 */
export async function getFeedbacksForMember(
  subordinateId: string | null,
  teamMemberId: string | null,
  cycleYear?: number
): Promise<{ data: SupervisorFeedback[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_feedbacks")
    .select(`
      *,
      supervisor:profiles!supervisor_feedbacks_supervisor_id_fkey(full_name, rank)
    `)
    .order("created_at", { ascending: false });

  if (subordinateId) {
    query = query.eq("subordinate_id", subordinateId);
  } else if (teamMemberId) {
    query = query.eq("team_member_id", teamMemberId);
  } else {
    return { data: [], error: "Either subordinateId or teamMemberId must be provided" };
  }

  if (cycleYear) {
    query = query.eq("cycle_year", cycleYear);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Get feedbacks error:", error);
    return { data: [], error: error.message };
  }

  // Transform the joined data
  const feedbacks: SupervisorFeedback[] = (data || []).map((fb: Record<string, unknown>) => ({
    ...fb,
    supervisor_name: (fb.supervisor as Record<string, unknown>)?.full_name || null,
    supervisor_rank: (fb.supervisor as Record<string, unknown>)?.rank || null,
  }));

  return { data: feedbacks as SupervisorFeedback[], error: null };
}

/**
 * Get a specific feedback by ID
 */
export async function getFeedback(
  feedbackId: string
): Promise<{ data: SupervisorFeedback | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("supervisor_feedbacks")
    .select(`
      *,
      supervisor:profiles!supervisor_feedbacks_supervisor_id_fkey(full_name, rank)
    `)
    .eq("id", feedbackId)
    .single();

  if (error) {
    console.error("Get feedback error:", error);
    return { data: null, error: error.message };
  }

  if (data) {
     
    const { supervisor, ...rest } = data;
    const feedback: SupervisorFeedback = {
      ...rest,
      supervisor_name: supervisor?.full_name || null,
      supervisor_rank: supervisor?.rank || null,
    };
    return { data: feedback, error: null };
  }

  return { data: null, error: null };
}

/**
 * Get feedbacks that the current user has received (as subordinate)
 */
export async function getMyReceivedFeedbacks(
  cycleYear?: number
): Promise<{ data: SupervisorFeedback[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_feedbacks")
    .select(`
      *,
      supervisor:profiles!supervisor_feedbacks_supervisor_id_fkey(full_name, rank)
    `)
    .eq("subordinate_id", user.id)
    .eq("status", "shared") // Only shared feedbacks
    .order("cycle_year", { ascending: false })
    .order("created_at", { ascending: false });

  if (cycleYear) {
    query = query.eq("cycle_year", cycleYear);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Get my received feedbacks error:", error);
    return { data: [], error: error.message };
  }

  // Transform the joined data
  const feedbacks: SupervisorFeedback[] = (data || []).map((fb: Record<string, unknown>) => ({
    ...fb,
    supervisor_name: (fb.supervisor as Record<string, unknown>)?.full_name || null,
    supervisor_rank: (fb.supervisor as Record<string, unknown>)?.rank || null,
  }));

  return { data: feedbacks as SupervisorFeedback[], error: null };
}

/**
 * Create or update a feedback
 */
export async function saveFeedback(
  subordinateId: string | null,
  teamMemberId: string | null,
  feedbackType: FeedbackType,
  cycleYear: number,
  content: string,
  reviewedAccomplishmentIds: string[] = []
): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated" };
  }

  // Use the database function for upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("upsert_supervisor_feedback", {
    p_subordinate_id: subordinateId,
    p_team_member_id: teamMemberId,
    p_feedback_type: feedbackType,
    p_cycle_year: cycleYear,
    p_content: content,
    p_reviewed_accomplishment_ids: reviewedAccomplishmentIds,
  });

  if (error) {
    console.error("Save feedback error:", error);
    return { data: null, error: error.message };
  }

  revalidatePath("/team");
  return { data: { id: data }, error: null };
}

/**
 * Share a feedback with the subordinate
 */
export async function shareFeedback(
  feedbackId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("share_supervisor_feedback", {
    p_feedback_id: feedbackId,
  });

  if (error) {
    console.error("Share feedback error:", error);
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Feedback not found or already shared" };
  }

  revalidatePath("/team");
  revalidatePath("/entries");
  return { success: true, error: null };
}

/**
 * Unshare a feedback (revert to draft)
 */
export async function unshareFeedback(
  feedbackId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("unshare_supervisor_feedback", {
    p_feedback_id: feedbackId,
  });

  if (error) {
    console.error("Unshare feedback error:", error);
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Feedback not found or not shared" };
  }

  revalidatePath("/team");
  revalidatePath("/entries");
  return { success: true, error: null };
}

/**
 * Delete a draft feedback
 */
export async function deleteFeedback(
  feedbackId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("supervisor_feedbacks")
    .delete()
    .eq("id", feedbackId)
    .eq("supervisor_id", user.id)
    .eq("status", "draft"); // Can only delete drafts

  if (error) {
    console.error("Delete feedback error:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/team");
  return { success: true, error: null };
}

