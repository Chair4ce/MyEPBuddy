import { generateText, type LanguageModel } from "ai";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import { buildAccomplishmentAssessmentPrompt } from "@/lib/assess-accomplishment-prompt";
import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";
import type {
  Accomplishment,
  AccomplishmentAssessmentScores,
  Rank,
} from "@/types/database";

/**
 * Run the ACA assessment LLM for one accomplishment (no billing / auth).
 * Returns null when the model response can't be parsed or validated.
 */
export async function runAccomplishmentAssessment(params: {
  accomplishment: Pick<
    Accomplishment,
    | "action_verb"
    | "details"
    | "impact"
    | "metrics"
    | "mpa"
    | "stewardship_impact"
    | "education_context"
  >;
  rateeRank: Rank | string | null;
  userId: string;
  model: LanguageModel;
  assessmentModelId: string;
}): Promise<AccomplishmentAssessmentScores | null> {
  const {
    accomplishment,
    rateeRank,
    userId,
    model,
    assessmentModelId,
  } = params;

  const assessmentPrompt = await appendUserRulesToPrompt(
    buildAccomplishmentAssessmentPrompt(
      {
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact,
        metrics: accomplishment.metrics,
        mpa: accomplishment.mpa,
        stewardship_impact: normalizeStewardshipImpact(
          accomplishment.stewardship_impact,
        ),
        education_context: accomplishment.education_context ?? null,
      },
      rateeRank,
    ),
    userId,
    "assessment",
  );

  const { text } = await generateText({
    model,
    prompt: assessmentPrompt,
    temperature: 0.2,
    maxOutputTokens: 1500,
  });

  let assessment: AccomplishmentAssessmentScores;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    assessment = JSON.parse(jsonMatch[0]);
  } catch {
    console.error(
      "Failed to parse assessment response for bundled plan assess:",
      text,
    );
    return null;
  }

  if (
    !assessment.mpa_relevancy ||
    typeof assessment.overall_score !== "number" ||
    !assessment.quality_indicators
  ) {
    return null;
  }

  // Keep model id on the payload for callers that persist assessment_model.
  void assessmentModelId;
  return assessment;
}

/** Simple promise pool — keeps LLM concurrency bounded. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
