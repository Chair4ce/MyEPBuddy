"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Accomplishment, EducationContext } from "@/types/database";
import { sanitizeEducationContext } from "@/lib/education-context";
import { awardsMatchRatee } from "@/lib/accomplishment-award-link";
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

type AccomplishmentWriteExtras = {
  award_ids?: string[];
  education_context?: EducationContext | null;
};

async function assertAwardsMatchRatee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  awardIds: string[],
  rateeUserId: string | null,
  rateeTeamMemberId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (awardIds.length === 0) return { ok: true };

  const unique = [...new Set(awardIds)];
  const { data, error } = await supabase
    .from("awards")
    .select("id, recipient_profile_id, recipient_team_member_id")
    .in("id", unique);

  if (error) {
    return { ok: false, error: error.message };
  }

  return awardsMatchRatee(
    (data || []) as Array<{
      id: string;
      recipient_profile_id: string | null;
      recipient_team_member_id: string | null;
    }>,
    unique,
    rateeUserId,
    rateeTeamMemberId
  );
}

async function replaceAccomplishmentAwards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  accomplishmentId: string,
  awardIds: string[]
): Promise<{ error?: string }> {
  const { data: existingRows, error: existingError } = await supabase
    .from("accomplishment_awards")
    .select("award_id")
    .eq("accomplishment_id", accomplishmentId);

  if (existingError) {
    return { error: existingError.message };
  }

  const existingIds = new Set<string>(
    ((existingRows || []) as Array<{ award_id: string }>).map((r) => r.award_id)
  );
  const nextIds = [...new Set(awardIds)];
  const nextSet = new Set(nextIds);

  const toRemove = [...existingIds].filter((id) => !nextSet.has(id));
  const toAdd = nextIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    const { error: delError } = await supabase
      .from("accomplishment_awards")
      .delete()
      .eq("accomplishment_id", accomplishmentId)
      .in("award_id", toRemove);

    if (delError) {
      return { error: delError.message };
    }
  }

  if (toAdd.length > 0) {
    const rows = toAdd.map((award_id) => ({
      accomplishment_id: accomplishmentId,
      award_id,
      sort_order: nextIds.indexOf(award_id),
    }));

    const { error: insError } = await supabase
      .from("accomplishment_awards")
      .insert(rows);

    if (insError) {
      return { error: insError.message };
    }
  }

  // Keep sort_order aligned with the requested order for surviving links.
  for (let index = 0; index < nextIds.length; index++) {
    const award_id = nextIds[index]!;
    if (toAdd.includes(award_id)) continue;
    const { error: sortError } = await supabase
      .from("accomplishment_awards")
      .update({ sort_order: index })
      .eq("accomplishment_id", accomplishmentId)
      .eq("award_id", award_id);
    if (sortError) {
      return { error: sortError.message };
    }
  }

  return {};
}

export async function createAccomplishment(
  data: Omit<Accomplishment, "id" | "created_at" | "updated_at" | "linked_award_ids"> &
    AccomplishmentWriteExtras
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { award_ids, education_context, ...rest } = data;
  const education = sanitizeEducationContext(education_context ?? null);

  // Server-side sensitive data scan — defense-in-depth
  const stewardship = rest.stewardship_impact ?? {};
  const validation = validateSensitiveData(
    {
      details: rest.details,
      impact: rest.impact,
      metrics: rest.metrics,
      stewardship_time: stewardship.time,
      stewardship_money: stewardship.money,
      stewardship_resources: stewardship.resources,
      stewardship_outcome: stewardship.outcome,
      education_program: education?.program,
    },
    user.id
  );
  if (validation.blocked) {
    return { error: validation.error };
  }

  const awardIds = award_ids ?? [];
  if (awardIds.length > 0) {
    const check = await assertAwardsMatchRatee(
      supabase,
      awardIds,
      rest.team_member_id ? null : rest.user_id,
      rest.team_member_id
    );
    if (!check.ok) {
      return { error: check.error };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accomplishment, error } = await (supabase as any)
    .from("accomplishments")
    .insert({
      ...rest,
      stewardship_impact: stewardship,
      education_context: education,
      created_by: rest.created_by || user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Create accomplishment error:", error);
    return { error: error.message };
  }

  if (awardIds.length > 0) {
    const linkResult = await replaceAccomplishmentAwards(
      supabase,
      accomplishment.id,
      awardIds
    );
    if (linkResult.error) {
      console.error("Link awards error:", linkResult.error);
      // Roll back the new accomplishment so we don't leave an orphan entry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("accomplishments")
        .delete()
        .eq("id", accomplishment.id);
      return { error: linkResult.error };
    }
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  return {
    data: {
      ...(accomplishment as Accomplishment),
      education_context: education,
      linked_award_ids: awardIds,
    } as Accomplishment,
  };
}

export async function updateAccomplishment(
  id: string,
  data: Partial<
    Omit<Accomplishment, "id" | "created_at" | "updated_at" | "linked_award_ids">
  > &
    AccomplishmentWriteExtras
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { award_ids, education_context, ...rest } = data;
  const hasEducationKey = Object.prototype.hasOwnProperty.call(
    data,
    "education_context"
  );
  const education = hasEducationKey
    ? sanitizeEducationContext(education_context ?? null)
    : undefined;

  // Server-side sensitive data scan — defense-in-depth
  // Only scan fields that are being updated
  const stewardship = rest.stewardship_impact;
  if (rest.details || rest.impact || rest.metrics || stewardship || education) {
    const validation = validateSensitiveData(
      {
        details: rest.details,
        impact: rest.impact,
        metrics: rest.metrics,
        stewardship_time: stewardship?.time,
        stewardship_money: stewardship?.money,
        stewardship_resources: stewardship?.resources,
        stewardship_outcome: stewardship?.outcome,
        education_program: education?.program,
      },
      user.id
    );
    if (validation.blocked) {
      return { error: validation.error };
    }
  }

  if (award_ids && award_ids.length > 0) {
    // Load ratee from existing row when not in payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: existingError } = await (supabase as any)
      .from("accomplishments")
      .select("user_id, team_member_id")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return { error: existingError?.message || "Accomplishment not found" };
    }

    const rateeUserId = rest.user_id ?? existing.user_id;
    const rateeTeamMemberId =
      rest.team_member_id !== undefined
        ? rest.team_member_id
        : existing.team_member_id;

    const check = await assertAwardsMatchRatee(
      supabase,
      award_ids,
      rateeTeamMemberId ? null : rateeUserId,
      rateeTeamMemberId
    );
    if (!check.ok) {
      return { error: check.error };
    }
  }

  const updatePayload = {
    ...rest,
    ...(education !== undefined ? { education_context: education } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accomplishment, error } = await (supabase as any)
    .from("accomplishments")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Update accomplishment error:", error);
    return { error: error.message };
  }

  if (award_ids !== undefined) {
    const linkResult = await replaceAccomplishmentAwards(
      supabase,
      id,
      award_ids
    );
    if (linkResult.error) {
      console.error("Link awards error:", linkResult.error);
      return { error: linkResult.error };
    }
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  return {
    data: {
      ...(accomplishment as Accomplishment),
      ...(education !== undefined ? { education_context: education } : {}),
      ...(award_ids !== undefined ? { linked_award_ids: award_ids } : {}),
    } as Accomplishment,
  };
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

export async function getAccomplishmentAwardIds(
  accomplishmentId: string
): Promise<{ data?: string[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("accomplishment_awards")
    .select("award_id, sort_order")
    .eq("accomplishment_id", accomplishmentId)
    .order("sort_order", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  return {
    data: ((data || []) as Array<{ award_id: string }>).map((r) => r.award_id),
  };
}

async function getAccomplishments(
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

async function getAccomplishmentsByMPA(
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
