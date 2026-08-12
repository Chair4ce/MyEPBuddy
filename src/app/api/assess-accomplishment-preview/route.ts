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
  isEnlisted,
  getRubricTierForRank,
  DEFAULT_APP_MODEL_ID,
} from "@/lib/constants";
import type { AccomplishmentAssessmentScores, EducationContext, Rank, StewardshipImpact } from "@/types/database";
import { buildAccomplishmentAssessmentPrompt } from "@/lib/assess-accomplishment-prompt";
import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";
import { normalizeEducationContext } from "@/lib/education-context";
import { scanAccomplishmentsForLLM } from "@/lib/sensitive-data-scanner";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface AssessPreviewRequest {
  action_verb: string;
  details: string;
  impact: string | null;
  metrics: string | null;
  stewardship_impact?: StewardshipImpact | null;
  education_context?: EducationContext | null;
  mpa: string;
  model?: string;
  rateeRank?: string | null;
  targetUserId?: string | null;
  targetManagedMemberId?: string | null;
}

async function resolveRateeRank(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  callerId: string,
  callerRank: string | null,
  targetUserId?: string | null,
  targetManagedMemberId?: string | null
): Promise<{ rateeRank: string | null; error?: NextResponse }> {
  if (targetManagedMemberId) {
    const { data: managedMembers, error } = await supabase.rpc(
      "get_visible_managed_members",
      { viewer_uuid: callerId }
    );

    if (error) {
      return {
        rateeRank: null,
        error: NextResponse.json(
          { error: "Failed to verify managed member access" },
          { status: 403 }
        ),
      };
    }

    const member = (managedMembers as { id: string; rank: string | null; member_status: string }[] | null)?.find(
      (m) => m.id === targetManagedMemberId && m.member_status !== "archived"
    );

    if (!member) {
      return {
        rateeRank: null,
        error: NextResponse.json(
          { error: "Access denied to this managed member" },
          { status: 403 }
        ),
      };
    }

    return { rateeRank: member.rank ?? null };
  }

  if (targetUserId) {
    if (targetUserId === callerId) {
      return { rateeRank: callerRank };
    }

    const { data: teamLink, error: teamError } = await supabase
      .from("teams")
      .select("subordinate_id")
      .eq("supervisor_id", callerId)
      .eq("subordinate_id", targetUserId)
      .maybeSingle();

    if (teamError || !teamLink) {
      return {
        rateeRank: null,
        error: NextResponse.json(
          { error: "Access denied to this subordinate" },
          { status: 403 }
        ),
      };
    }

    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("rank")
      .eq("id", targetUserId)
      .single();

    if (profileError || !targetProfile) {
      return {
        rateeRank: null,
        error: NextResponse.json(
          { error: "Subordinate profile not found" },
          { status: 403 }
        ),
      };
    }

    return { rateeRank: targetProfile.rank ?? null };
  }

  return { rateeRank: callerRank };
}

export async function POST(request: Request) {
  let modelId = DEFAULT_APP_MODEL_ID;
  let billableCtx: BillableRequestContext | null = null;
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: AssessPreviewRequest = await request.json();
    const {
      action_verb,
      details,
      impact,
      metrics,
      stewardship_impact,
      education_context,
      mpa,
      model = DEFAULT_APP_MODEL_ID,
      targetUserId,
      targetManagedMemberId,
    } = body;
    const stewardship = normalizeStewardshipImpact(stewardship_impact ?? {});
    const education = normalizeEducationContext(education_context ?? null);
    modelId = await resolveRequestedModel(model, "generate");

    if (!action_verb || !details) {
      return NextResponse.json(
        { error: "Missing required fields: action_verb and details" },
        { status: 400 }
      );
    }

    // Pre-transmission sensitive data scan — block before data reaches LLM providers
    const accScan = scanAccomplishmentsForLLM([{
      details,
      impact,
      metrics,
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

    // Get user's profile for rank context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("rank")
      .eq("id", user.id)
      .single();

    const { rateeRank: resolvedRateeRank, error: rateeError } =
      await resolveRateeRank(
        supabase,
        user.id,
        profile?.rank ?? null,
        targetUserId,
        targetManagedMemberId
      );

    if (rateeError) {
      return rateeError;
    }

    if (isCivilian(resolvedRateeRank ?? null)) {
      return NextResponse.json(
        { error: "Civilian users do not have accomplishment assessments" },
        { status: 400 }
      );
    }

    if (
      !resolvedRateeRank ||
      (typeof resolvedRateeRank === "string" && !resolvedRateeRank.trim())
    ) {
      return NextResponse.json(
        { error: "Ratee rank is required for accomplishment assessment" },
        { status: 400 }
      );
    }

    if (!isEnlisted(resolvedRateeRank)) {
      return NextResponse.json(
        {
          error:
            "Accomplishment assessment is only available for enlisted ratees",
        },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Usage tracking — enforce weekly limit for default-key users
    billableCtx = {
      ...(await createBillableRequestContext(request, user.id)),
      usageCheck: null,
    };

    const replayed = await getReplayedBillableResponse(billableCtx);
    if (replayed) return replayed;

    const usageCheck = await checkAndTrackUsage(
      user.id,
      "assess_accomplishment_preview",
      modelId,
      userKeys,
      billableCtx.idempotencyKey,
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;

    // Build the assessment prompt with rank-appropriate ACA rubric
    const assessmentPrompt = await appendUserRulesToPrompt(
      buildAccomplishmentAssessmentPrompt(
        {
          action_verb,
          details,
          impact,
          metrics,
          mpa,
          stewardship_impact: stewardship,
          education_context: education,
        },
        resolvedRateeRank
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
      temperature: 0.2,
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

    // Determine the rubric tier for the response
    const rubricTier = getRubricTierForRank(resolvedRateeRank as Rank);
    const formUsed = rubricTier === "senior" ? "AF Form 932" : "AF Form 931";

    return cacheBillableJson(billableCtx, {
      assessment,
      model,
      rubricTier,
      formUsed,
      rateeRank: resolvedRateeRank || null,
    }, usageCheck);
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(error, "POST /api/assess-accomplishment-preview", modelId, billableCtx);
    }
    return handleLLMError(error, "POST /api/assess-accomplishment-preview", modelId);
  }
}
