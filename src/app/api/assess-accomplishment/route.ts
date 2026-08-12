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
  isCivilian,
  DEFAULT_APP_MODEL_ID,
} from "@/lib/constants";
import type { AccomplishmentAssessmentScores } from "@/types/database";
import { scanAccomplishmentsForLLM } from "@/lib/sensitive-data-scanner";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import { resolveAccomplishmentRateeRank } from "@/lib/accomplishment-ratee-rank";
import { buildAccomplishmentAssessmentPrompt } from "@/lib/assess-accomplishment-prompt";
import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";

// Allow up to 60s for LLM calls
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
        { status: 400 }
      );
    }

    // Fetch the accomplishment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accomplishment, error: fetchError } = await (supabase as any)
      .from("accomplishments")
      .select("*")
      .eq("id", accomplishmentId)
      .single();

    if (fetchError || !accomplishment) {
      return NextResponse.json(
        { error: "Accomplishment not found" },
        { status: 404 }
      );
    }

    // Verify user has access (owner or supervisor)
    const isOwner = accomplishment.user_id === user.id;
    const isCreator = accomplishment.created_by === user.id;
    
    if (!isOwner && !isCreator) {
      // Check if user is in the supervisor chain
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: subordinateChain } = await (supabase as any)
        .rpc("get_subordinate_chain", { supervisor_uuid: user.id });
      
      const isInChain = subordinateChain?.some(
        (s: { subordinate_id: string }) => s.subordinate_id === accomplishment.user_id
      );
      
      if (!isInChain) {
        return NextResponse.json(
          { error: "Access denied to this accomplishment" },
          { status: 403 }
        );
      }
    }

    // Pre-transmission sensitive data scan — block before data reaches LLM providers
    const stewardship = normalizeStewardshipImpact(
      accomplishment.stewardship_impact
    );
    const accScan = scanAccomplishmentsForLLM([{
      details: accomplishment.details,
      impact: accomplishment.impact,
      metrics: accomplishment.metrics,
      stewardship_time: stewardship.time,
      stewardship_money: stewardship.money,
      stewardship_resources: stewardship.resources,
      stewardship_outcome: stewardship.outcome,
    }]);
    if (accScan.blocked) {
      return NextResponse.json(
        { error: "Accomplishment contains sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before assessing." },
        { status: 400 }
      );
    }

    // Resolve ratee rank: managed-member rows use team_member_id (not user_id/supervisor)
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
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();
    modelId = await resolveRequestedModel(model, "generate");

    // Usage tracking — enforce weekly limit for default-key users
    billableCtx = {
      ...(await createBillableRequestContext(request, user.id)),
      usageCheck: null,
    };

    const replayed = await getReplayedBillableResponse(billableCtx);
    if (replayed) return replayed;

    const usageCheck = await checkAndTrackUsage(user.id, "assess_accomplishment", modelId, userKeys, billableCtx.idempotencyKey);
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;

    // Build the assessment prompt with rank-appropriate ACA rubric
    const assessmentPrompt = await appendUserRulesToPrompt(
      buildAccomplishmentAssessmentPrompt(
        {
          action_verb: accomplishment.action_verb,
          details: accomplishment.details,
          impact: accomplishment.impact,
          metrics: accomplishment.metrics,
          mpa: accomplishment.mpa,
          stewardship_impact: normalizeStewardshipImpact(
            accomplishment.stewardship_impact
          ),
          education_context: accomplishment.education_context ?? null,
        },
        rateeRank
      ),
      user.id,
      "assessment",
    );

    // Get model provider
    const modelProvider = getModelProvider(effectiveModel, userKeys, usageCheck.tracking);

    // Generate the assessment
    const { text } = await generateText({
      model: modelProvider,
      prompt: assessmentPrompt,
      temperature: 0.2, // Low temperature for consistent scoring
      maxOutputTokens: 1500,
    });

    // Parse the response
    let assessment: AccomplishmentAssessmentScores;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        assessment = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse assessment response:", parseError);
      console.error("Raw response:", text);
      return refundAndError(billableCtx, { error: "Failed to parse assessment results" }, { status: 500 });
    }

    // Validate the assessment structure
    if (
      !assessment.mpa_relevancy ||
      typeof assessment.overall_score !== "number" ||
      !assessment.quality_indicators
    ) {
      return refundAndError(billableCtx, { error: "Invalid assessment structure returned" }, { status: 500 });
    }

    // Update the accomplishment with assessment scores
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
      console.error("Failed to update accomplishment with assessment:", updateError);
      return refundAndError(billableCtx, { error: "Failed to save assessment results" }, { status: 500 });
    }

    return cacheBillableJson(billableCtx, {
      assessment,
      assessed_at: new Date().toISOString(),
      model,
    }, usageCheck);
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(error, "POST /api/assess-accomplishment", modelId, billableCtx);
    }
    return handleLLMError(error, "POST /api/assess-accomplishment", modelId);
  }
}
