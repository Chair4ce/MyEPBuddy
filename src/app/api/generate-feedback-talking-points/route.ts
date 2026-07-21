import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import {
  cacheBillableJson,
  createBillableRequestContext,
  getReplayedBillableResponse,
  handleBillableLLMError,
  refundAndError,
  type BillableRequestContext,
} from "@/lib/billing/billable-request";
import { handleLLMError } from "@/lib/llm-error-handler";
import { enforceUsageGate } from "@/lib/usage-gate";
import {
  DEFAULT_APP_MODEL_ID,
  ENTRY_MGAS,
  getRubricTierForRank,
  isCivilian,
} from "@/lib/constants";
import type { Accomplishment, FeedbackType, Rank } from "@/types/database";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import {
  checkAndTrackUsage,
} from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import {
  buildAccomplishmentsSummary,
  buildPortfolioFromEntries,
  buildTalkingPointsUserPrompt,
  FEEDBACK_TALKING_POINTS_GUARDRAILS,
  formatTalkingPointsDraft,
  isFeedbackType,
  parseTalkingPointsDraft,
  type EpbStatementSummary,
} from "@/lib/feedback-talking-points";

export const maxDuration = 60;

interface GenerateFeedbackTalkingPointsRequest {
  feedbackType: FeedbackType;
  subordinateId?: string | null;
  teamMemberId?: string | null;
  cycleYear: number;
  model?: string;
}

interface VerifiedRatee {
  rank: Rank | string | null;
  name: string;
  subordinateId: string | null;
  teamMemberId: string | null;
}

async function verifyRateeAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  callerId: string,
  subordinateId?: string | null,
  teamMemberId?: string | null
): Promise<{ ratee?: VerifiedRatee; error?: NextResponse }> {
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

async function loadExpectations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  supervisorId: string,
  ratee: VerifiedRatee,
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
  return data?.expectation_text?.trim() || null;
}

async function loadAccomplishments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ratee: VerifiedRatee,
  cycleYear: number
): Promise<{ accomplishments?: Accomplishment[]; error?: NextResponse }> {
  // Select only fields needed for portfolio + prompt evidence (avoid select *)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("accomplishments")
    .select(
      "id, date, action_verb, details, impact, metrics, mpa, assessment_scores, cycle_year, user_id, team_member_id"
    )
    .eq("cycle_year", cycleYear)
    .order("date", { ascending: false })
    .limit(200);

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

  return { accomplishments: (data as Accomplishment[]) ?? [] };
}

async function loadEpbStatements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ratee: VerifiedRatee,
  cycleYear: number
): Promise<EpbStatementSummary[] | null> {
  interface EPBShellSection {
    mpa: string;
    statement_text: string;
  }

  interface EPBShellData {
    sections: EPBShellSection[];
  }

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
  if (error || !data) {
    return null;
  }

  const shell = data as EPBShellData;
  const mpaKeys = new Set(ENTRY_MGAS.map((mpa) => mpa.key));
  const statements: EpbStatementSummary[] = [];
  for (const section of shell.sections ?? []) {
    const text = section.statement_text?.trim() ?? "";
    if (!mpaKeys.has(section.mpa) || text.length <= 10) continue;
    statements.push({ mpa: section.mpa, text });
  }

  return statements.length > 0 ? statements : null;
}

export async function POST(request: Request) {
  let modelId: string | undefined;
  let billableCtx: BillableRequestContext | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GenerateFeedbackTalkingPointsRequest = await request.json();
    const {
      feedbackType,
      subordinateId = null,
      teamMemberId = null,
      cycleYear,
      model = DEFAULT_APP_MODEL_ID,
    } = body;

    if (!isFeedbackType(feedbackType)) {
      return NextResponse.json(
        { error: "Invalid feedbackType. Expected initial, midterm, or final." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(cycleYear) || cycleYear < 2000 || cycleYear > 2100) {
      return NextResponse.json(
        { error: "Invalid cycleYear" },
        { status: 400 }
      );
    }

    const access = await verifyRateeAccess(
      supabase,
      user.id,
      subordinateId,
      teamMemberId
    );
    if (access.error || !access.ratee) {
      return access.error!;
    }

    const ratee = access.ratee;

    if (isCivilian(ratee.rank)) {
      return NextResponse.json(
        { error: "Civilian ratees do not have ACA feedback talking points" },
        { status: 400 }
      );
    }

    if (!getRubricTierForRank(ratee.rank as Rank)) {
      return NextResponse.json(
        { error: "No ACA rubric applies to this ratee rank" },
        { status: 400 }
      );
    }

    const [expectations, accomplishmentsResult] = await Promise.all([
      loadExpectations(supabase, user.id, ratee, cycleYear),
      loadAccomplishments(supabase, ratee, cycleYear),
    ]);
    if (accomplishmentsResult.error || !accomplishmentsResult.accomplishments) {
      return accomplishmentsResult.error!;
    }
    const accomplishments = accomplishmentsResult.accomplishments;

    const portfolio = buildPortfolioFromEntries(accomplishments);
    const accomplishmentsSummary = buildAccomplishmentsSummary(
      accomplishments,
      portfolio
    );

    const warnings: string[] = [];
    let epbStatements: EpbStatementSummary[] | undefined;

    if (feedbackType === "final") {
      const loadedStatements = await loadEpbStatements(
        supabase,
        ratee,
        cycleYear
      );
      if (loadedStatements) {
        epbStatements = loadedStatements;
      } else {
        warnings.push("epb_statements_unavailable");
      }
    }

    const userKeys = await getDecryptedApiKeys();
    modelId = await resolveRequestedModel(model, "generate");

    billableCtx = {
      ...(await createBillableRequestContext(request, user.id)),
      usageCheck: null,
    };

    const replayed = await getReplayedBillableResponse(billableCtx);
    if (replayed) return replayed;

    const usageCheck = await checkAndTrackUsage(
      user.id,
      "generate_feedback_talking_points",
      modelId,
      userKeys,
      billableCtx.idempotencyKey
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const userPrompt = buildTalkingPointsUserPrompt({
      feedbackType,
      ratee: { rank: ratee.rank, name: ratee.name },
      expectations,
      portfolio,
      accomplishmentsSummary,
      epbStatements,
    });

    const systemPrompt = await appendUserRulesToPrompt(
      `You are an expert Air Force supervisor coach helping prepare evidence-based feedback session talking points.\n\n${FEEDBACK_TALKING_POINTS_GUARDRAILS}`,
      user.id,
      "assessment"
    );

    const modelProvider = getModelProvider(
      effectiveModel,
      userKeys,
      usageCheck.tracking
    );

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.35,
      maxOutputTokens: 4000,
    });

    let talkingPoints;
    try {
      talkingPoints = parseTalkingPointsDraft(text, feedbackType);
    } catch (parseError) {
      console.error("Failed to parse talking points:", parseError);
      console.error("Raw response:", text);
      return refundAndError(
        billableCtx,
        { error: "Failed to parse generated talking points. Please try again." },
        { status: 500 }
      );
    }

    const draftText = formatTalkingPointsDraft(talkingPoints);

    return cacheBillableJson(
      billableCtx,
      {
        draftText,
        talkingPoints,
        reviewedAccomplishmentIds:
          accomplishmentsSummary.reviewedAccomplishmentIds,
        model: effectiveModel,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      usageCheck
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/generate-feedback-talking-points",
        modelId,
        billableCtx
      );
    }
    return handleLLMError(
      error,
      "POST /api/generate-feedback-talking-points",
      modelId
    );
  }
}
