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
import {
  allocateEpbCandidatePools,
  poolsToFallbackPlan,
} from "@/lib/assign-epb-sentences";
import { buildGroupEpbPrompt } from "@/lib/plan-epb-prompt";
import {
  sanitizePlan,
  toPlanRecords,
  type EpbPlan,
  type PlanAccomplishmentRecord,
} from "@/lib/plan-epb";
import { ACA_PORTFOLIO_MPA_KEYS } from "@/lib/cycle-portfolio";
import type { Accomplishment, Rank } from "@/types/database";

/**
 * Hybrid EPB planning:
 * 1) Score-based candidate pools per MPA (home + stash/pop cross-fill)
 * 2) LLM groups each pool by action→result→impact similarity (not verb match)
 */
export const maxDuration = 90;

interface PlanEpbRequest {
  rateeId: string;
  isManagedMember?: boolean;
  rateeRank: Rank;
  rateeAfsc?: string;
  cycleYear: number;
  model?: string;
  dutyDescription?: string;
  /** When set, only these accomplishment ids are considered (preselect on /entries). */
  accomplishmentIds?: string[];
}

function parseGroupJson(text: string, validIds: Set<string>): EpbPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in grouping response");
  return sanitizePlan(JSON.parse(match[0]), validIds);
}

/** Drop any id the model moved outside its allocated pool. */
function constrainPlanToPools(
  plan: EpbPlan,
  pools: Record<string, string[]>
): EpbPlan {
  const allowed = new Map(
    ACA_PORTFOLIO_MPA_KEYS.map((key) => [key, new Set(pools[key] ?? [])])
  );
  return {
    mpas: plan.mpas
      .map((selection) => {
        const allow = allowed.get(selection.mpaKey);
        if (!allow) return null;
        const sentences = selection.sentences
          .map((s) => ({
            ...s,
            accomplishmentIds: s.accomplishmentIds.filter((id) => allow.has(id)),
          }))
          .filter((s) => s.accomplishmentIds.length > 0);
        if (sentences.length === 0) return null;
        return { ...selection, sentences };
      })
      .filter((s): s is NonNullable<typeof s> => !!s),
  };
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
      accomplishmentIds,
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

    let accomplishments = (rows ?? []) as Accomplishment[];
    if (accomplishmentIds?.length) {
      const allow = new Set(accomplishmentIds);
      accomplishments = accomplishments.filter((a) => allow.has(a.id));
    }

    const records: PlanAccomplishmentRecord[] = toPlanRecords(accomplishments);
    if (records.length === 0) {
      return NextResponse.json(
        { error: "No accomplishments found for this ratee and cycle." },
        { status: 400 }
      );
    }

    const pools = allocateEpbCandidatePools(records);
    const poolIds = new Set(
      ACA_PORTFOLIO_MPA_KEYS.flatMap((key) => pools[key])
    );
    if (poolIds.size === 0) {
      return NextResponse.json(
        {
          error:
            "Could not select statements from these accomplishments. Add or strengthen entries and try again.",
        },
        { status: 422 }
      );
    }

    const scan = scanAccomplishmentsForLLM(
      accomplishments
        .filter((a) => poolIds.has(a.id))
        .map((a) => {
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

    const recordsById = new Map(records.map((r) => [r.id, r] as const));
    const prompt = buildGroupEpbPrompt({
      pools,
      recordsById,
      rateeRank,
      rateeAfsc,
      dutyDescription,
    });

    let plan: EpbPlan;
    try {
      const { text } = await generateText({
        model: modelProvider,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 2000,
      });
      plan = constrainPlanToPools(parseGroupJson(text, poolIds), pools);
    } catch {
      // LLM unavailable / bad JSON — still return a usable score-ranked plan.
      plan = poolsToFallbackPlan(pools, records);
    }

    if (plan.mpas.length === 0) {
      return refundAndError(
        billableCtx,
        {
          error:
            "The planner could not group statements from these accomplishments. Add or strengthen entries and try again.",
        },
        { status: 422 }
      );
    }

    return cacheBillableJson(billableCtx, { plan, records, pools }, usageCheck);
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
