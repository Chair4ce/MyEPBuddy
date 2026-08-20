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
  type BillableRequestContext,
} from "@/lib/billing/billable-request";
import { handleLLMError } from "@/lib/llm-error-handler";
import { enforceUsageGate } from "@/lib/usage-gate";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import type { PromptRuleContext } from "@/types/database";
import {
  isSingleSelectableWord,
  sanitizeThesaurusWord,
  WORD_THESAURUS_MAX_WORD_LENGTH,
} from "@/lib/word-thesaurus";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface SynonymRequest {
  word: string;
  fullStatement: string;
  sentence?: string;
  model: string;
  context?: "epb" | "decoration" | "award"; // Type of document for better suggestions
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

    const body: SynonymRequest = await request.json();
    const { model, context = "epb" } = body;
    const word = sanitizeThesaurusWord(body.word ?? "");
    const fullStatement =
      typeof body.fullStatement === "string" ? body.fullStatement.slice(0, 8000) : "";
    const sentence =
      typeof body.sentence === "string" ? body.sentence.slice(0, 800) : "";
    if (!word || !fullStatement) {
      return NextResponse.json(
        { error: "Word and full statement are required" },
        { status: 400 }
      );
    }
    if (!isSingleSelectableWord(word) || word.length > WORD_THESAURUS_MAX_WORD_LENGTH) {
      return NextResponse.json(
        { error: "Select a single word to find replacements" },
        { status: 400 }
      );
    }

    const userKeys = await getDecryptedApiKeys();
    modelId = await resolveRequestedModel(model, "global");

    billableCtx = {
      ...(await createBillableRequestContext(request, user.id)),
      usageCheck: null,
    };

    const replayed = await getReplayedBillableResponse(billableCtx);
    if (replayed) return replayed;

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(
      user.id,
      "synonyms",
      modelId,
      userKeys,
      billableCtx.idempotencyKey,
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const modelProvider = getModelProvider(effectiveModel, userKeys, usageCheck.tracking);

    // Document type specific guidance
    const documentTypes: Record<string, { name: string; guidance: string }> = {
      epb: {
        name: "Enlisted Performance Brief (EPB) statement",
        guidance: "Use strong action verbs and impactful language suitable for performance evaluation.",
      },
      decoration: {
        name: "Air Force decoration citation",
        guidance: "Use formal, dignified language appropriate for decoration citations. Emphasize distinguished service, meritorious achievement, and professional excellence.",
      },
      award: {
        name: "Air Force award nomination (AF Form 1206)",
        guidance: "Use powerful action verbs and quantifiable impact language suitable for award packages.",
      },
    };

    const docType = documentTypes[context] || documentTypes.epb;

    const rulesContext: PromptRuleContext =
      context === "award"
        ? "award"
        : context === "decoration"
          ? "decoration"
          : "epb";
    const systemPrompt = await appendUserRulesToPrompt(
      `You are an expert military writing assistant specializing in Air Force performance and recognition documents. Suggest replacement words for one highlighted word inside a ${docType.name}.

GUIDELINES:
1. **SENTENCE FIRST** — The containing sentence is the primary context. Suggest replacements that fit THAT sentence's meaning, grammar, and tense — not a generic thesaurus dump.
2. Use the full statement only to confirm tone and nearby facts.
3. ${docType.guidance}
4. Each suggestion MUST drop in as a direct substitute (same part of speech, same tense/number).
5. Prefer single words. Short phrases only when the original is a compound idea.
6. Order from MOST context-fit / impactful to least.
7. Do NOT include the original word.

IMPORTANT: Return ONLY a JSON array of 6-8 replacements.`,
      user.id,
      rulesContext,
    );

    const userPrompt = `Replace the word "${word}" in this ${docType.name}.

CONTAINING SENTENCE (primary context):
"${sentence || fullStatement}"

FULL STATEMENT (secondary context):
"${fullStatement}"

Suggest 6-8 replacements a senior Air Force leader would actually use in this sentence.

Return ONLY a JSON array of strings:
["replacement1", "replacement2", ...]`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    let synonyms: string[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        synonyms = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // Fallback: try to extract words from text
      synonyms = text
        .split(/[,\n]/)
        .map((s) => s.replace(/["\[\]]/g, "").trim())
        .filter((s) => s.length > 0 && s.length < 50);
    }

    // Deduplicate case-insensitively while preserving the model's casing
    const seen = new Set<string>();
    const originalKey = word.toLowerCase();
    synonyms = synonyms
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => {
        if (!item || item.length > 50) return false;
        const key = item.toLowerCase();
        if (key === originalKey || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return cacheBillableJson(
      billableCtx,
      { suggestions: synonyms, synonyms },
      usageCheck,
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/synonyms",
        modelId,
        billableCtx,
      );
    }
    return handleLLMError(error, "POST /api/synonyms", modelId);
  }
}


