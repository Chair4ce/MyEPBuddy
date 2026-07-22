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
  getRubricTierForRank,
  isCivilian,
  isEnlisted,
} from "@/lib/constants";
import type { FeedbackType, Rank } from "@/types/database";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import { isFeedbackType } from "@/lib/feedback-talking-points";
import {
  buildGuideReviseUserPrompt,
  FEEDBACK_SESSION_GUIDE_REVISE_GUARDRAILS,
  looksLikePackageReviewGuide,
  sanitizeInitialSessionGuideText,
} from "@/lib/feedback-session-guide-revise";
import { verifyFeedbackRateeAccess } from "@/lib/feedback-session-guide-loaders";
import { scanTextForLLM } from "@/lib/sensitive-data-scanner";

export const maxDuration = 60;

interface ReviseGuideRequest {
  feedbackType: FeedbackType;
  draftText?: string;
  subordinateId?: string | null;
  teamMemberId?: string | null;
  cycleYear: number;
  model?: string;
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

    const body: ReviseGuideRequest = await request.json();
    const {
      feedbackType,
      draftText = "",
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
      return NextResponse.json({ error: "Invalid cycleYear" }, { status: 400 });
    }

    if (feedbackType === "initial" && !draftText.trim()) {
      return NextResponse.json(
        { error: "Add session guide notes before revising Initial feedback." },
        { status: 400 }
      );
    }

    const access = await verifyFeedbackRateeAccess(
      supabase,
      user.id,
      subordinateId,
      teamMemberId
    );
    if (access.error || !access.ratee) {
      return access.error!;
    }

    const ratee = access.ratee;

    if (
      !ratee.rank ||
      (typeof ratee.rank === "string" && !ratee.rank.trim())
    ) {
      return NextResponse.json(
        { error: "Ratee rank is required for ACA feedback session guides" },
        { status: 400 }
      );
    }

    if (isCivilian(ratee.rank)) {
      return NextResponse.json(
        { error: "Civilian ratees do not have ACA feedback session guides" },
        { status: 400 }
      );
    }

    if (!isEnlisted(ratee.rank as Rank)) {
      return NextResponse.json(
        {
          error:
            "ACA feedback session guides are only available for enlisted ratees",
        },
        { status: 400 }
      );
    }

    if (!getRubricTierForRank(ratee.rank as Rank)) {
      return NextResponse.json(
        { error: "No ACA rubric applies to this ratee rank" },
        { status: 400 }
      );
    }

    const warnings: string[] = [];

    if (draftText.trim()) {
      const draftScan = scanTextForLLM(draftText);
      if (draftScan.blocked) {
        return NextResponse.json(
          {
            error:
              "Session guide contains sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before revising.",
          },
          { status: 400 }
        );
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
      "revise_feedback_session_guide",
      modelId,
      userKeys,
      billableCtx.idempotencyKey
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const initialDraftWasPackageReview =
      feedbackType === "initial" && looksLikePackageReviewGuide(draftText);
    const effectiveDraft =
      feedbackType === "initial"
        ? sanitizeInitialSessionGuideText(draftText)
        : draftText;

    if (initialDraftWasPackageReview) {
      warnings.push("initial_package_review_stripped");
    }

    const userPrompt = buildGuideReviseUserPrompt({
      feedbackType,
      rateeRank: ratee.rank,
      rateeName: ratee.name,
      draftText: effectiveDraft,
    });

    const phaseSystemExtra =
      feedbackType === "initial"
        ? "\n\nINITIAL PHASE ONLY: Format the supervisor's draft into beginning-of-cycle expectations. Never use accomplishments, assessment scores, or EPB content. Never output Strengths to recognize, Gaps / risks, or Evidence to have handy."
        : "\n\nSETTINGS FORMAT ONLY: Organize the supervisor's ACA form-prep checklist. Never cite accomplishments, assessment scores, or EPB content. Do not produce a package-review talking-points brief.";

    const systemPrompt = await appendUserRulesToPrompt(
      `You are an expert Air Force supervisor coach helping revise private feedback session guides.\n\n${FEEDBACK_SESSION_GUIDE_REVISE_GUARDRAILS}${phaseSystemExtra}`,
      user.id,
      "assessment"
    );

    const modelProvider = getModelProvider(
      usageCheck.effectiveModel,
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

    let revisedText = text?.trim() ?? "";
    if (feedbackType === "initial") {
      revisedText = sanitizeInitialSessionGuideText(revisedText);
    }

    if (!revisedText) {
      return refundAndError(
        billableCtx,
        { error: "Revision returned empty content. Please try again." },
        { status: 500 }
      );
    }

    return cacheBillableJson(
      billableCtx,
      {
        revisedText,
        model: usageCheck.effectiveModel,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      usageCheck
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/revise-feedback-session-guide",
        modelId,
        billableCtx
      );
    }
    return handleLLMError(error, "POST /api/revise-feedback-session-guide", modelId);
  }
}
