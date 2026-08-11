import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assignEpbSentenceGroups } from "@/lib/assign-epb-sentences";
import { isCivilian, isEnlisted } from "@/lib/constants";
import { toPlanRecords, type PlanAccomplishmentRecord } from "@/lib/plan-epb";
import { handleLLMError } from "@/lib/llm-error-handler";
import type { Accomplishment, Rank } from "@/types/database";

/**
 * Score-based EPB planning (no LLM). Assigns up to two sentence groups per
 * core MPA via home claims + stash/pop cross-fill from assessment relevancy.
 */
export const maxDuration = 30;

interface PlanEpbRequest {
  rateeId: string;
  isManagedMember?: boolean;
  rateeRank: Rank;
  rateeAfsc?: string;
  cycleYear: number;
  model?: string;
  dutyDescription?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: PlanEpbRequest = await request.json();
    const {
      rateeId,
      isManagedMember = false,
      rateeRank,
      cycleYear,
    } = body;

    if (!rateeId || !rateeRank || !cycleYear) {
      return NextResponse.json(
        { error: "Missing required fields: rateeId, rateeRank, cycleYear" },
        { status: 400 }
      );
    }
    if (isCivilian(rateeRank) || !isEnlisted(rateeRank)) {
      return NextResponse.json(
        { error: "Full EPB planning is available for enlisted ratees only." },
        { status: 400 }
      );
    }

    // Load the ratee's cycle accomplishments. RLS restricts rows to those the
    // caller may read, so this doubles as the authorization check.
    let query = supabase
      .from("accomplishments")
      .select("*")
      .eq("cycle_year", cycleYear);
    query = isManagedMember
      ? query.eq("team_member_id", rateeId)
      : query.eq("user_id", rateeId).is("team_member_id", null);

    const { data: rows, error: loadError } = await query;
    if (loadError) {
      return NextResponse.json(
        { error: "Failed to load accomplishments" },
        { status: 500 }
      );
    }

    const accomplishments = (rows ?? []) as Accomplishment[];
    const records: PlanAccomplishmentRecord[] = toPlanRecords(accomplishments);
    if (records.length === 0) {
      return NextResponse.json(
        { error: "No accomplishments found for this ratee and cycle." },
        { status: 400 }
      );
    }

    const plan = assignEpbSentenceGroups(records);
    if (plan.mpas.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not select statements from these accomplishments. Add or strengthen entries and try again.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ plan, records });
  } catch (error) {
    return handleLLMError(error, "POST /api/plan-epb");
  }
}
