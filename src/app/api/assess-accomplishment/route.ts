import { createClient } from "@/lib/supabase/server";
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
  isCivilian,
  DEFAULT_APP_MODEL_ID,
} from "@/lib/constants";
import { scanAccomplishmentsForLLM } from "@/lib/sensitive-data-scanner";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { resolveAccomplishmentRateeRank } from "@/lib/accomplishment-ratee-rank";
import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";
import { runAccomplishmentAssessment } from "@/lib/run-accomplishment-assessment";

export const maxDuration = 60;

interface AssessAccomplishmentRequest {
  accomplishmentId: string;
  model?: string;
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

    const body: AssessAccomplishmentRequest = await request.json();
    const { accomplishmentId, model = DEFAULT_APP_MODEL_ID } = body;

    if (!accomplishmentId) {
      return NextResponse.json(
        { error: "Missing required field: accomplishmentId" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accomplishment, error: fetchError } = await (supabase as any)
      .from("accomplishments")
      .select("*")
      .eq("id", accomplishmentId)
      .single();

    if (fetchError || !accomplishment) {
      return NextResponse.json(
        { error: "Accomplishment not found" },
        { status: 404 },
      );
    }

    const isOwner = accomplishment.user_id === user.id;
    const isCreator = accomplishment.created_by === user.id;

    if (!isOwner && !isCreator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: subordinateChain } = await (supabase as any).rpc(
        "get_subordinate_chain",
        { supervisor_uuid: user.id },
      );

      const isInChain = subordinateChain?.some(
        (s: { subordinate_id: string }) =>
          s.subordinate_id === accomplishment.user_id,
      );

      if (!isInChain) {
        return NextResponse.json(
          { error: "Access denied to this accomplishment" },
          { status: 403 },
        );
      }
    }

    const stewardship = normalizeStewardshipImpact(
      accomplishment.stewardship_impact,
    );
    const accScan = scanAccomplishmentsForLLM([
      {
        details: accomplishment.details,
        impact: accomplishment.impact,
        metrics: accomplishment.metrics,
        stewardship_time: stewardship.time,
        stewardship_money: stewardship.money,
        stewardship_resources: stewardship.resources,
        stewardship_outcome: stewardship.outcome,
      },
    ]);
    if (accScan.blocked) {
      return NextResponse.json(
        {
          error:
            "Accomplishment contains sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before assessing.",
        },
        { status: 400 },
      );
    }

    let managedMemberRank: string | null = null;
    if (accomplishment.team_member_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: managedMember } = await (supabase as any)
        .from("team_members")
        .select("rank")
        .eq("id", accomplishment.team_member_id)
        .maybeSingle();
      managedMemberRank = managedMember?.rank ?? null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownerProfile } = await (supabase as any)
      .from("profiles")
      .select("rank")
      .eq("id", accomplishment.user_id)
      .single();

    const rateeRank = resolveAccomplishmentRateeRank({
      teamMemberId: accomplishment.team_member_id,
      managedMemberRank,
      ownerProfileRank: ownerProfile?.rank ?? null,
    });

    if (isCivilian(rateeRank)) {
      return NextResponse.json(
        { error: "Civilian ratees do not have accomplishment assessments" },
        { status: 400 },
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
      "assess_accomplishment",
      modelId,
      userKeys,
      billableCtx.idempotencyKey,
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const modelProvider = getModelProvider(
      effectiveModel,
      userKeys,
      usageCheck.tracking,
    );

    const assessment = await runAccomplishmentAssessment({
      accomplishment,
      rateeRank,
      userId: user.id,
      model: modelProvider,
      assessmentModelId: model,
    });

    if (!assessment) {
      return refundAndError(
        billableCtx,
        { error: "Failed to parse assessment results" },
        { status: 500 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("accomplishments")
      .update({
        assessment_scores: assessment,
        assessed_at: new Date().toISOString(),
        assessment_model: model,
      })
      .eq("id", accomplishmentId);

    if (updateError) {
      console.error(
        "Failed to update accomplishment with assessment:",
        updateError,
      );
      return refundAndError(
        billableCtx,
        { error: "Failed to save assessment results" },
        { status: 500 },
      );
    }

    return cacheBillableJson(
      billableCtx,
      {
        assessment,
        assessed_at: new Date().toISOString(),
        model,
      },
      usageCheck,
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/assess-accomplishment",
        modelId,
        billableCtx,
      );
    }
    return handleLLMError(error, "POST /api/assess-accomplishment", modelId);
  }
}
