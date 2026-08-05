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
import { DEFAULT_APP_MODEL_ID, isCivilian, isEnlisted } from "@/lib/constants";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { scanAccomplishmentsForLLM } from "@/lib/sensitive-data-scanner";
import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";
import { buildPlanEpbPrompt } from "@/lib/plan-epb-prompt";
import {
  chunkForPlanning,
  mergeChunkPlans,
  sanitizePlan,
  toPlanRecords,
  trimMergedPlan,
  type EpbPlan,
  type PlanAccomplishmentRecord,
} from "@/lib/plan-epb";
import type { Accomplishment, Rank } from "@/types/database";

// Planning fires one LLM call per chunk; allow generous time for large cycles.
export const maxDuration = 90;

interface PlanEpbRequest {
  rateeId: string;
  isManagedMember?: boolean;
  rateeRank: Rank;
  rateeAfsc?: string;
  cycleYear: number;
  model?: string;
  dutyDescription?: string;
}

function parsePlanJson(text: string, validIds: Set<string>): EpbPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in planning response");
  return sanitizePlan(JSON.parse(match[0]), validIds);
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

    const body: PlanEpbRequest = await request.json();
    const {
      rateeId,
      isManagedMember = false,
      rateeRank,
      rateeAfsc,
      cycleYear,
      model = DEFAULT_APP_MODEL_ID,
      dutyDescription,
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

    // Block before any data reaches the LLM if PII/CUI is detected.
    const scan = scanAccomplishmentsForLLM(
      accomplishments.map((a) => {
        const stewardship = normalizeStewardshipImpact(a.stewardship_impact);
        return {
          details: a.details,
          impact: a.impact,
          metrics: a.metrics,
          stewardship_time: stewardship.time,
          stewardship_money: stewardship.money,
          stewardship_resources: stewardship.resources,
          stewardship_outcome: stewardship.outcome,
        };
      })
    );
    if (scan.blocked) {
      return NextResponse.json(
        {
          error:
            "One or more accomplishments contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Remove it before generating.",
        },
        { status: 400 }
      );
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
      "plan_epb",
      modelId,
      userKeys,
      billableCtx.idempotencyKey
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const modelProvider = getModelProvider(
      usageCheck.effectiveModel,
      userKeys,
      usageCheck.tracking
    );

    const validIds = new Set(records.map((r) => r.id));
    const chunks = chunkForPlanning(records);

    const chunkPlans = await Promise.all(
      chunks.map(async (chunk) => {
        const prompt = buildPlanEpbPrompt({
          records: chunk,
          rateeRank,
          rateeAfsc,
          dutyDescription,
          isChunked: chunks.length > 1,
        });
        const { text } = await generateText({
          model: modelProvider,
          prompt,
          temperature: 0.2,
          maxOutputTokens: 2000,
        });
        return parsePlanJson(text, validIds);
      })
    );

    const merged = mergeChunkPlans(chunkPlans);
    const scoreById = new Map(
      records.map((r) => [r.id, r.overallScore ?? 0] as const)
    );
    const plan = trimMergedPlan(merged, scoreById);

    if (plan.mpas.length === 0) {
      return refundAndError(
        billableCtx,
        {
          error:
            "The planner could not select statements from these accomplishments. Add or strengthen entries and try again.",
        },
        { status: 422 }
      );
    }

    return cacheBillableJson(billableCtx, { plan, records }, usageCheck);
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/plan-epb",
        modelId,
        billableCtx
      );
    }
    return handleLLMError(error, "POST /api/plan-epb", modelId);
  }
}
