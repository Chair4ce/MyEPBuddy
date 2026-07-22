import { NextResponse } from "next/server";
import { ENTRY_MGAS } from "@/lib/constants";
import type { EpbStatementSummary } from "@/lib/feedback-talking-points";
import type { Accomplishment, Rank } from "@/types/database";

export interface VerifiedFeedbackRatee {
  rank: Rank | string | null;
  name: string;
  subordinateId: string | null;
  teamMemberId: string | null;
}

export async function verifyFeedbackRateeAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  callerId: string,
  subordinateId?: string | null,
  teamMemberId?: string | null
): Promise<{ ratee?: VerifiedFeedbackRatee; error?: NextResponse }> {
  if (!subordinateId && !teamMemberId) {
    return {
      error: NextResponse.json(
        { error: "Either subordinateId or teamMemberId is required" },
        { status: 400 }
      ),
    };
  }

  if (subordinateId && teamMemberId) {
    return {
      error: NextResponse.json(
        { error: "Provide only one of subordinateId or teamMemberId" },
        { status: 400 }
      ),
    };
  }

  if (teamMemberId) {
    const { data: managedMembers, error } = await supabase.rpc(
      "get_visible_managed_members",
      { viewer_uuid: callerId }
    );

    if (error) {
      return {
        error: NextResponse.json(
          { error: "Failed to verify managed member access" },
          { status: 403 }
        ),
      };
    }

    const member = (
      managedMembers as
        | { id: string; full_name: string; rank: string | null; member_status: string }[]
        | null
    )?.find((m) => m.id === teamMemberId && m.member_status !== "archived");

    if (!member) {
      return {
        error: NextResponse.json(
          { error: "Access denied to this managed member" },
          { status: 403 }
        ),
      };
    }

    return {
      ratee: {
        rank: member.rank,
        name: member.full_name,
        subordinateId: null,
        teamMemberId,
      },
    };
  }

  const { data: teamLink, error: teamError } = await supabase
    .from("teams")
    .select("subordinate_id")
    .eq("supervisor_id", callerId)
    .eq("subordinate_id", subordinateId)
    .maybeSingle();

  if (teamError || !teamLink) {
    return {
      error: NextResponse.json(
        { error: "Access denied to this subordinate" },
        { status: 403 }
      ),
    };
  }

  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("rank, full_name")
    .eq("id", subordinateId)
    .single();

  if (profileError || !targetProfile) {
    return {
      error: NextResponse.json(
        { error: "Subordinate profile not found" },
        { status: 403 }
      ),
    };
  }

  return {
    ratee: {
      rank: targetProfile.rank,
      name: targetProfile.full_name ?? "Unknown",
      subordinateId: subordinateId ?? null,
      teamMemberId: null,
    },
  };
}

export async function loadFeedbackExpectations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  supervisorId: string,
  ratee: VerifiedFeedbackRatee,
  cycleYear: number
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("supervisor_expectations")
    .select("expectation_text")
    .eq("supervisor_id", supervisorId)
    .eq("cycle_year", cycleYear);

  if (ratee.subordinateId) {
    query = query.eq("subordinate_id", ratee.subordinateId);
  } else {
    query = query.eq("team_member_id", ratee.teamMemberId);
  }

  const { data } = await query.maybeSingle();
  if (data?.expectation_text?.trim()) {
    return data.expectation_text.trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initialQuery = (supabase as any)
    .from("supervisor_feedbacks")
    .select("content")
    .eq("supervisor_id", supervisorId)
    .eq("cycle_year", cycleYear)
    .eq("feedback_type", "initial");

  if (ratee.subordinateId) {
    initialQuery = initialQuery.eq("subordinate_id", ratee.subordinateId);
  } else {
    initialQuery = initialQuery.eq("team_member_id", ratee.teamMemberId);
  }

  const { data: initial } = await initialQuery.maybeSingle();
  return initial?.content?.trim() || null;
}

export async function loadFeedbackAccomplishments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ratee: VerifiedFeedbackRatee,
  cycleYear: number
): Promise<{
  accomplishments?: Accomplishment[];
  truncated?: boolean;
  error?: NextResponse;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("accomplishments")
    .select(
      "id, date, action_verb, details, impact, metrics, mpa, assessment_scores, cycle_year, user_id, team_member_id"
    )
    .eq("cycle_year", cycleYear)
    .order("date", { ascending: false })
    .limit(201);

  if (ratee.teamMemberId) {
    query = query.eq("team_member_id", ratee.teamMemberId);
  } else {
    query = query.eq("user_id", ratee.subordinateId).is("team_member_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Load accomplishments error:", error);
    return {
      error: NextResponse.json(
        { error: "Failed to load accomplishments for this ratee" },
        { status: 500 }
      ),
    };
  }

  const rows = (data as Accomplishment[]) ?? [];
  const truncated = rows.length > 200;
  return {
    accomplishments: truncated ? rows.slice(0, 200) : rows,
    truncated,
  };
}

export async function loadFeedbackEpbStatements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ratee: VerifiedFeedbackRatee,
  cycleYear: number
): Promise<{
  statements?: EpbStatementSummary[];
  error?: NextResponse;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("epb_shells")
    .select(`
      id,
      sections:epb_shell_sections(mpa, statement_text)
    `)
    .eq("cycle_year", cycleYear)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (ratee.teamMemberId) {
    query = query.eq("team_member_id", ratee.teamMemberId);
  } else {
    query = query.eq("user_id", ratee.subordinateId).is("team_member_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Load EPB statements error:", error);
    return {
      error: NextResponse.json(
        { error: "Failed to load EPB statements for this ratee" },
        { status: 500 }
      ),
    };
  }
  if (!data) {
    return { statements: [] };
  }

  const mpaKeys = new Set(ENTRY_MGAS.map((mpa) => mpa.key));
  const statements: EpbStatementSummary[] = [];
  for (const section of data.sections ?? []) {
    const text = section.statement_text?.trim() ?? "";
    if (!text || !mpaKeys.has(section.mpa)) continue;
    statements.push({ mpa: section.mpa, text });
  }
  return { statements };
}
