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
import type { Rank } from "@/types/database";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import { buildCycleAcaStrengthsWeaknesses } from "@/lib/feedback-aca-strengths-weaknesses";
import {
  buildAccomplishmentsSummary,
  buildPortfolioFromEntries,
} from "@/lib/feedback-talking-points";
import {
  buildGuideGenerateUserPrompt,
  getGenerateGuardrailsForType,
  isGenerateFeedbackType,
  type GenerateGuidePromptInput,
} from "@/lib/feedback-session-guide-generate";
import {
  loadFeedbackAccomplishments,
  loadFeedbackEpbStatements,
  loadFeedbackExpectations,
  verifyFeedbackRateeAccess,
} from "@/lib/feedback-session-guide-loaders";
import {
  scanAccomplishmentsForLLM,
  scanTextForLLM,
} from "@/lib/sensitive-data-scanner";

export const maxDuration = 60;

interface GenerateGuideRequest {
  feedbackType: "midterm" | "final";
  sessionSettings?: string;
  includedAccomplishmentIds?: string[];
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

    const body: GenerateGuideRequest = await request.json();
    const {
      feedbackType,
      sessionSettings = "",
      includedAccomplishmentIds = [],
      subordinateId = null,
      teamMemberId = null,
      cycleYear,
      model = DEFAULT_APP_MODEL_ID,
    } = body;

    if (!isGenerateFeedbackType(feedbackType)) {
      return NextResponse.json(
        { error: "Invalid feedbackType. Expected midterm or final." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(cycleYear) || cycleYear < 2000 || cycleYear > 2100) {
      return NextResponse.json({ error: "Invalid cycleYear" }, { status: 400 });
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
    const expectations = await loadFeedbackExpectations(
      supabase,
      user.id,
      ratee,
      cycleYear
    );

    if (sessionSettings.trim()) {
      const settingsScan = scanTextForLLM(sessionSettings);
      if (settingsScan.blocked) {
        return NextResponse.json(
          {
            error:
              "Session settings contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating.",
          },
          { status: 400 }
        );
      }
    }

    if (expectations) {
      const expectationsScan = scanTextForLLM(expectations);
      if (expectationsScan.blocked) {
        return NextResponse.json(
          {
            error:
              "Expectations contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating.",
          },
          { status: 400 }
        );
      }
    }

    const promptInput: GenerateGuidePromptInput = {
      feedbackType,
      rateeRank: ratee.rank,
      rateeName: ratee.name,
      sessionSettings,
      expectations,
    };
    let reviewedIds: string[] = [];

    if (feedbackType === "midterm") {
      const accomplishmentsResult = await loadFeedbackAccomplishments(
        supabase,
        ratee,
        cycleYear
      );
      if (
        accomplishmentsResult.error ||
        !accomplishmentsResult.accomplishments
      ) {
        return accomplishmentsResult.error!;
      }
      if (accomplishmentsResult.truncated) {
        warnings.push("accomplishments_truncated");
      }

      const accessible = accomplishmentsResult.accomplishments;
      if (accessible.length === 0) {
        return NextResponse.json(
          {
            error:
              "Add accomplishments before generating a Midterm feedback guide.",
          },
          { status: 400 }
        );
      }

      const requestedIds = Array.isArray(includedAccomplishmentIds)
        ? includedAccomplishmentIds.filter((id) => typeof id === "string")
        : [];
      const included =
        requestedIds.length > 0
          ? accessible.filter((a) => requestedIds.includes(a.id))
          : accessible;
      if (included.length === 0) {
        return NextResponse.json(
          {
            error:
              "No accessible accomplishments for this ratee in the selected cycle.",
          },
          { status: 400 }
        );
      }

      const unassessedIncludedCount = included.filter(
        (a) => !a.assessment_scores
      ).length;
      if (unassessedIncludedCount > 0) {
        warnings.push("unassessed_included");
      }

      const accScan = scanAccomplishmentsForLLM(included);
      if (accScan.blocked) {
        return NextResponse.json(
          {
            error:
              "Entry contains sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating.",
          },
          { status: 400 }
        );
      }

      const portfolio = buildPortfolioFromEntries(included);
      promptInput.portfolio = portfolio;
      promptInput.accomplishmentsSummary = buildAccomplishmentsSummary(
        included,
        portfolio
      );
      promptInput.acaStrengthsWeaknesses = buildCycleAcaStrengthsWeaknesses(
        included,
        ratee.rank
      );
      promptInput.unassessedIncludedCount = unassessedIncludedCount;
      reviewedIds = included.map((a) => a.id);
    } else {
      const epbResult = await loadFeedbackEpbStatements(
        supabase,
        ratee,
        cycleYear
      );
      if (epbResult.error) {
        return epbResult.error;
      }
      const epbStatements = epbResult.statements ?? [];
      if (epbStatements.length === 0) {
        return NextResponse.json(
          {
            error:
              "Add EPB statements for this cycle before generating a Final feedback guide.",
          },
          { status: 400 }
        );
      }

      const epbScan = scanTextForLLM(...epbStatements.map((s) => s.text));
      if (epbScan.blocked) {
        return NextResponse.json(
          {
            error:
              "EPB statements contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating.",
          },
          { status: 400 }
        );
      }

      promptInput.epbStatements = epbStatements;
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
      "generate_feedback_session_guide",
      modelId,
      userKeys,
      billableCtx.idempotencyKey
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const userPrompt = buildGuideGenerateUserPrompt(promptInput);

    const systemPrompt = await appendUserRulesToPrompt(
      `You are an expert Air Force supervisor coach helping generate private Feedback Session Guide outline briefs.\n\n${getGenerateGuardrailsForType(feedbackType)}`,
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
      temperature: 0.4,
      maxOutputTokens: 4500,
    });

    const generatedText = text?.trim() ?? "";
    if (!generatedText) {
      return refundAndError(
        billableCtx,
        { error: "Generation returned empty content. Please try again." },
        { status: 500 }
      );
    }

    return cacheBillableJson(
      billableCtx,
      {
        generatedText,
        includedAccomplishmentIds: reviewedIds,
        model: usageCheck.effectiveModel,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      usageCheck
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/generate-feedback-session-guide",
        modelId,
        billableCtx
      );
    }
    return handleLLMError(
      error,
      "POST /api/generate-feedback-session-guide",
      modelId
    );
  }
}
