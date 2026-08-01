import { getNextEpbShellCycleYear } from "@/lib/constants";
import type { EPBShell, EPBShellSection, Rank } from "@/types/database";
import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type EpbShellCreateRatee = {
  id: string;
  rank: Rank | null;
  isManagedMember: boolean;
};

export type EpbShellWithSections = EPBShell & { sections: EPBShellSection[] };

export type CreateEpbShellResult =
  | { status: "created"; shell: EpbShellWithSections; cycleYear: number }
  | { status: "loaded_existing"; shell: EpbShellWithSections }
  | { status: "archived_conflict"; shellId: string; cycleYear: number }
  | { status: "active_exists" };

export type CreateEpbShellInput = {
  ratee: EpbShellCreateRatee;
  profileId: string;
  cycleYear?: number;
  /** Pre-fetched cycle years; fetched when omitted. */
  cycleYears?: number[];
};

async function fetchShellWithSections(
  supabase: BrowserSupabaseClient,
  shellId: string
): Promise<EpbShellWithSections> {
  const { data, error } = await supabase
    .from("epb_shells")
    .select(`*, sections:epb_shell_sections(*)`)
    .eq("id", shellId)
    .single();

  if (error) throw error;
  return data as EpbShellWithSections;
}

export async function listEpbShellCycleYears(
  supabase: BrowserSupabaseClient,
  ratee: Pick<EpbShellCreateRatee, "id" | "isManagedMember">
): Promise<number[]> {
  let historyQuery = supabase.from("epb_shells").select("cycle_year");

  if (ratee.isManagedMember) {
    historyQuery = historyQuery.eq("team_member_id", ratee.id);
  } else {
    historyQuery = historyQuery
      .eq("user_id", ratee.id)
      .is("team_member_id", null);
  }

  const { data: historyData } = await historyQuery;
  return ((historyData as { cycle_year: number }[] | null) ?? []).map(
    (row) => row.cycle_year
  );
}

export async function fetchActiveEpbShell(
  supabase: BrowserSupabaseClient,
  ratee: Pick<EpbShellCreateRatee, "id" | "isManagedMember">
): Promise<{ id: string } | null> {
  let query = supabase.from("epb_shells").select("id").neq("status", "archived");

  if (ratee.isManagedMember) {
    query = query.eq("team_member_id", ratee.id);
  } else {
    query = query.eq("user_id", ratee.id).is("team_member_id", null);
  }

  const { data } = await query.maybeSingle();
  return (data as { id: string } | null) ?? null;
}

export async function createEpbShell(
  supabase: BrowserSupabaseClient,
  input: CreateEpbShellInput
): Promise<CreateEpbShellResult> {
  const {
    ratee,
    profileId,
    cycleYear: explicitCycleYear,
    cycleYears: prefetchedCycleYears,
  } = input;

  const cycleYears =
    prefetchedCycleYears ?? (await listEpbShellCycleYears(supabase, ratee));

  const targetCycleYear =
    explicitCycleYear ??
    getNextEpbShellCycleYear(ratee.rank, cycleYears);

  const activeShell = await fetchActiveEpbShell(supabase, ratee);
  if (activeShell) {
    return { status: "active_exists" };
  }

  let existingQuery = supabase
    .from("epb_shells")
    .select("id, status, cycle_year")
    .eq("cycle_year", targetCycleYear);

  if (ratee.isManagedMember) {
    existingQuery = existingQuery.eq("team_member_id", ratee.id);
  } else {
    existingQuery = existingQuery
      .eq("user_id", ratee.id)
      .is("team_member_id", null);
  }

  const { data: existingShellData } = await existingQuery.maybeSingle();
  const existingShell = existingShellData as {
    id: string;
    status: string;
    cycle_year: number;
  } | null;

  if (existingShell) {
    if (existingShell.status === "archived") {
      return {
        status: "archived_conflict",
        shellId: existingShell.id,
        cycleYear: existingShell.cycle_year,
      };
    }

    const shell = await fetchShellWithSections(supabase, existingShell.id);
    return { status: "loaded_existing", shell };
  }

  const insertData: {
    user_id: string;
    team_member_id?: string;
    created_by: string;
    cycle_year: number;
  } = {
    user_id: ratee.isManagedMember ? profileId : ratee.id,
    created_by: profileId,
    cycle_year: targetCycleYear,
  };

  if (ratee.isManagedMember) {
    insertData.team_member_id = ratee.id;
  }

  const { data: insertedShell, error: insertError } = await supabase
    .from("epb_shells")
    .insert(insertData as never)
    .select("id")
    .single();

  if (insertError) throw insertError;
  if (!insertedShell) throw new Error("No shell returned from insert");

  await new Promise((resolve) => setTimeout(resolve, 100));

  const shellId = (insertedShell as { id: string }).id;
  const shell = await fetchShellWithSections(supabase, shellId);

  return { status: "created", shell, cycleYear: targetCycleYear };
}
