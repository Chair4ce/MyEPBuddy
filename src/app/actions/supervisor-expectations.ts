"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupervisorExpectation } from "@/types/database";

/**
 * Get expectation for a specific subordinate/team member for a given cycle year
 */
export async function getExpectation(
  subordinateId: string | null,
  teamMemberId: string | null,
  cycleYear: number
): Promise<{ data: SupervisorExpectation | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated" };
  }

  // Build query based on target type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_expectations")
    .select(`
      *,
      supervisor:profiles!supervisor_expectations_supervisor_id_fkey(full_name, rank)
    `)
    .eq("cycle_year", cycleYear);

  if (subordinateId) {
    query = query.eq("subordinate_id", subordinateId);
  } else if (teamMemberId) {
    query = query.eq("team_member_id", teamMemberId);
  } else {
    return { data: null, error: "Either subordinateId or teamMemberId must be provided" };
  }

  // Also filter by supervisor if the current user is the supervisor
  query = query.eq("supervisor_id", user.id);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Get expectation error:", error);
    return { data: null, error: error.message };
  }

  // Transform the joined data
  if (data) {
     
    const { supervisor, ...rest } = data;
    const expectation: SupervisorExpectation = {
      ...rest,
      supervisor_name: supervisor?.full_name || null,
      supervisor_rank: supervisor?.rank || null,
    };
    return { data: expectation, error: null };
  }

  return { data: null, error: null };
}

/**
 * Get all expectations set for the current user (as subordinate)
 */
export async function getMyExpectations(
  cycleYear?: number
): Promise<{ data: SupervisorExpectation[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_expectations")
    .select(`
      *,
      supervisor:profiles!supervisor_expectations_supervisor_id_fkey(full_name, rank)
    `)
    .eq("subordinate_id", user.id)
    .order("cycle_year", { ascending: false });

  if (cycleYear) {
    query = query.eq("cycle_year", cycleYear);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Get my expectations error:", error);
    return { data: [], error: error.message };
  }

  // Transform the joined data
  const expectations: SupervisorExpectation[] = (data || []).map((exp: Record<string, unknown>) => ({
    ...exp,
    supervisor_name: (exp.supervisor as Record<string, unknown>)?.full_name || null,
    supervisor_rank: (exp.supervisor as Record<string, unknown>)?.rank || null,
  }));

  return { data: expectations, error: null };
}

/**
 * Get all expectations set by the current user (as supervisor)
 */
export async function getExpectationsBySupervisor(
  cycleYear?: number
): Promise<{ data: SupervisorExpectation[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_expectations")
    .select("*")
    .eq("supervisor_id", user.id)
    .order("cycle_year", { ascending: false });

  if (cycleYear) {
    query = query.eq("cycle_year", cycleYear);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Get expectations by supervisor error:", error);
    return { data: [], error: error.message };
  }

  return { data: data as SupervisorExpectation[], error: null };
}

/**
 * Create or update an expectation for a subordinate
 */
export async function setExpectation(
  subordinateId: string | null,
  teamMemberId: string | null,
  expectationText: string,
  cycleYear: number
): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated" };
  }

  if (!expectationText.trim()) {
    return { data: null, error: "Expectation text cannot be empty" };
  }

  // Use the database function for upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("upsert_supervisor_expectation", {
    p_subordinate_id: subordinateId,
    p_team_member_id: teamMemberId,
    p_expectation_text: expectationText.trim(),
    p_cycle_year: cycleYear,
  });

  if (error) {
    console.error("Set expectation error:", error);
    return { data: null, error: error.message };
  }

  revalidatePath("/team");
  revalidatePath("/entries");
  return { data: { id: data }, error: null };
}

/**
 * Delete an expectation
 */
export async function deleteExpectation(
  expectationId: string
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
    .from("supervisor_expectations")
    .delete()
    .eq("id", expectationId)
    .eq("supervisor_id", user.id); // Ensure only supervisor can delete

  if (error) {
    console.error("Delete expectation error:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/team");
  revalidatePath("/entries");
  return { success: true, error: null };
}
