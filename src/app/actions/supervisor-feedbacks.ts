"use server";

import { revalidatePath } from "next/cache";
import { ENTRY_MGAS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  Accomplishment,
  SupervisorFeedback,
  FeedbackType,
} from "@/types/database";

export type FeedbackEvidenceItem = Pick<
  Accomplishment,
  | "id"
  | "date"
  | "action_verb"
  | "details"
  | "impact"
  | "mpa"
  | "assessment_scores"
  | "cycle_year"
>;

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
    session_settings: typeof fb.session_settings === "string" ? fb.session_settings : "",
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
    const isSupervisor = user.id === rest.supervisor_id;
    const feedback: SupervisorFeedback = {
      ...rest,
      session_settings: isSupervisor
        ? typeof rest.session_settings === "string"
          ? rest.session_settings
          : ""
        : "",
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
      id,
      supervisor_id,
      subordinate_id,
      team_member_id,
      feedback_type,
      cycle_year,
      content,
      reviewed_accomplishment_ids,
      status,
      shared_at,
      supervision_start_date,
      supervision_end_date,
      created_at,
      updated_at,
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

  // Transform the joined data — session_settings is private rater prep; never expose to ratees
  const feedbacks: SupervisorFeedback[] = (data || []).map((fb: Record<string, unknown>) => ({
    ...fb,
    session_settings: "",
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
  reviewedAccomplishmentIds: string[] = [],
  sessionSettings?: string | null
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
    p_session_settings: sessionSettings ?? null,
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

export type FeedbackEpbStatementItem = {
  mpa: string;
  text: string;
};

/**
 * Cycle accomplishments + assessments for Midterm evidence review.
 * Access-checked: caller must supervise the ratee (profile or managed member).
 */
export async function getFeedbackEvidenceAccomplishments(
  subordinateId: string | null,
  teamMemberId: string | null,
  cycleYear: number
): Promise<{
  data: FeedbackEvidenceItem[];
  truncated: boolean;
  error: string | null;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], truncated: false, error: "Not authenticated" };
  }

  if (!subordinateId && !teamMemberId) {
    return {
      data: [],
      truncated: false,
      error: "Either subordinateId or teamMemberId must be provided",
    };
  }

  if (subordinateId && teamMemberId) {
    return {
      data: [],
      truncated: false,
      error: "Provide only one of subordinateId or teamMemberId",
    };
  }

  if (teamMemberId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: managedMembers, error } = await (supabase as any).rpc(
      "get_visible_managed_members",
      { viewer_uuid: user.id }
    );
    if (error) {
      return { data: [], truncated: false, error: "Failed to verify access" };
    }
    const member = (
      managedMembers as { id: string; member_status: string }[] | null
    )?.find((m) => m.id === teamMemberId && m.member_status !== "archived");
    if (!member) {
      return { data: [], truncated: false, error: "Access denied" };
    }
  } else if (subordinateId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teamRow, error } = await (supabase as any)
      .from("teams")
      .select("id")
      .eq("supervisor_id", user.id)
      .eq("subordinate_id", subordinateId)
      .maybeSingle();
    if (error || !teamRow) {
      return { data: [], truncated: false, error: "Access denied" };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("accomplishments")
    .select(
      "id, date, action_verb, details, impact, mpa, assessment_scores, cycle_year"
    )
    .eq("cycle_year", cycleYear)
    .order("date", { ascending: false })
    .limit(201);

  if (teamMemberId) {
    query = query.eq("team_member_id", teamMemberId);
  } else {
    query = query.eq("user_id", subordinateId).is("team_member_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Get feedback evidence error:", error);
    return { data: [], truncated: false, error: error.message };
  }

  const rows = (data as FeedbackEvidenceItem[]) ?? [];
  const truncated = rows.length > 200;
  return {
    data: truncated ? rows.slice(0, 200) : rows,
    truncated,
    error: null,
  };
}

/**
 * Cycle EPB MPA statements for Final feedback guide grounding.
 * Access-checked: caller must supervise the ratee (profile or managed member).
 */
export async function getFeedbackEpbPackage(
  subordinateId: string | null,
  teamMemberId: string | null,
  cycleYear: number
): Promise<{
  data: FeedbackEpbStatementItem[];
  error: string | null;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  if (!subordinateId && !teamMemberId) {
    return {
      data: [],
      error: "Either subordinateId or teamMemberId must be provided",
    };
  }

  if (subordinateId && teamMemberId) {
    return {
      data: [],
      error: "Provide only one of subordinateId or teamMemberId",
    };
  }

  if (teamMemberId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: managedMembers, error } = await (supabase as any).rpc(
      "get_visible_managed_members",
      { viewer_uuid: user.id }
    );
    if (error) {
      return { data: [], error: "Failed to verify access" };
    }
    const member = (
      managedMembers as { id: string; member_status: string }[] | null
    )?.find((m) => m.id === teamMemberId && m.member_status !== "archived");
    if (!member) {
      return { data: [], error: "Access denied" };
    }
  } else if (subordinateId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teamRow, error } = await (supabase as any)
      .from("teams")
      .select("id")
      .eq("supervisor_id", user.id)
      .eq("subordinate_id", subordinateId)
      .maybeSingle();
    if (error || !teamRow) {
      return { data: [], error: "Access denied" };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("epb_shells")
    .select(
      `
      id,
      sections:epb_shell_sections(mpa, statement_text)
    `
    )
    .eq("cycle_year", cycleYear)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (teamMemberId) {
    query = query.eq("team_member_id", teamMemberId);
  } else {
    query = query.eq("user_id", subordinateId).is("team_member_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Get feedback EPB package error:", error);
    return { data: [], error: error.message };
  }
  if (!data) {
    return { data: [], error: null };
  }

  const mpaKeys = new Set(ENTRY_MGAS.map((mpa) => mpa.key));
  const statements: FeedbackEpbStatementItem[] = [];
  for (const section of data.sections ?? []) {
    const text = section.statement_text?.trim() ?? "";
    if (!text || !mpaKeys.has(section.mpa)) continue;
    statements.push({ mpa: section.mpa, text });
  }
  return { data: statements, error: null };
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

