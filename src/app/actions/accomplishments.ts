"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Accomplishment } from "@/types/database";
import {
  scanForSensitiveData,
  getScanSummary,
  type SensitiveMatch,
} from "@/lib/sensitive-data-scanner";

// ---------------------------------------------------------------------------
// Audit helper – writes to sensitive_data_audit_log via service_role
// (table has RLS that blocks anon/authenticated roles)
// ---------------------------------------------------------------------------

async function logSensitiveDataEvent(
  action: "blocked" | "redacted" | "scan_clean",
  accomplishmentId: string | null,
  userId: string,
  matches: SensitiveMatch[],
  originalSnippets?: Record<string, string>
) {
  try {
    const service = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).from("sensitive_data_audit_log").insert({
      accomplishment_id: accomplishmentId,
      user_id: userId,
      action,
      matches: matches.length > 0 ? matches.map((m) => ({
        type: m.type,
        category: m.category,
        severity: m.severity,
        label: m.label,
        field: m.field,
      })) : null,
      original_snippets: originalSnippets || null,
    });
  } catch (err) {
    // Audit logging should never block the main operation
    console.error("Failed to write sensitive data audit log:", err);
  }
}

// ---------------------------------------------------------------------------
// Server-side sensitive data validation (defense-in-depth)
// ---------------------------------------------------------------------------

function validateSensitiveData(
  fields: Record<string, string | null | undefined>,
  userId: string
): { blocked: boolean; matches: SensitiveMatch[]; error?: string } {
  const matches = scanForSensitiveData(fields);
  if (matches.length > 0) {
    // Fire-and-forget audit log for the blocked attempt
    logSensitiveDataEvent("blocked", null, userId, matches);
    return {
      blocked: true,
      matches,
      error: getScanSummary(matches),
    };
  }
  return { blocked: false, matches: [] };
}

export async function createAccomplishment(
  data: Omit<Accomplishment, "id" | "created_at" | "updated_at">
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Server-side sensitive data scan — defense-in-depth
  const stewardship = data.stewardship_impact ?? {};
  const validation = validateSensitiveData(
    {
      details: data.details,
      impact: data.impact,
      metrics: data.metrics,
      stewardship_time: stewardship.time,
      stewardship_money: stewardship.money,
      stewardship_resources: stewardship.resources,
      stewardship_outcome: stewardship.outcome,
    },
    user.id
  );
  if (validation.blocked) {
    return { error: validation.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accomplishment, error } = await (supabase as any)
    .from("accomplishments")
    .insert({
      ...data,
      stewardship_impact: stewardship,
      created_by: data.created_by || user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Create accomplishment error:", error);
    return { error: error.message };
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  return { data: accomplishment as Accomplishment };
}

export async function updateAccomplishment(
  id: string,
  data: Partial<Omit<Accomplishment, "id" | "created_at" | "updated_at">>
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Server-side sensitive data scan — defense-in-depth
  // Only scan fields that are being updated
  const stewardship = data.stewardship_impact;
  if (data.details || data.impact || data.metrics || stewardship) {
    const validation = validateSensitiveData(
      {
        details: data.details,
        impact: data.impact,
        metrics: data.metrics,
        stewardship_time: stewardship?.time,
        stewardship_money: stewardship?.money,
        stewardship_resources: stewardship?.resources,
        stewardship_outcome: stewardship?.outcome,
      },
      user.id
    );
    if (validation.blocked) {
      return { error: validation.error };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accomplishment, error } = await (supabase as any)
    .from("accomplishments")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Update accomplishment error:", error);
    return { error: error.message };
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  return { data: accomplishment as Accomplishment };
}

export async function deleteAccomplishment(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("accomplishments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete accomplishment error:", error);
    return { error: error.message };
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getAccomplishments(
  userId: string,
  cycleYear: number
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accomplishments")
    .select("*")
    .eq("user_id", userId)
    .eq("cycle_year", cycleYear)
    .order("date", { ascending: false });

  if (error) {
    console.error("Get accomplishments error:", error);
    return { error: error.message };
  }

  return { data: data as unknown as Accomplishment[] };
}

export async function getAccomplishmentsByMPA(
  userId: string,
  cycleYear: number,
  mpa: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accomplishments")
    .select("*")
    .eq("user_id", userId)
    .eq("cycle_year", cycleYear)
    .eq("mpa", mpa)
    .order("date", { ascending: false });

  if (error) {
    console.error("Get accomplishments by MPA error:", error);
    return { error: error.message };
  }

  return { data: data as unknown as Accomplishment[] };
}
