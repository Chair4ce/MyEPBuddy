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
  DEFAULT_MPA_DESCRIPTIONS,
  ENTRY_MGAS,
} from "@/lib/constants";
import { cleanText } from "@/lib/text-cleaning";
import { scanTextForLLM } from "@/lib/sensitive-data-scanner";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { appendUserRulesToPrompt } from "@/lib/prompt-rules/server";
import {
  MAX_EXTRACTED_ACCOMPLISHMENTS,
  mergeGrammarPolishedAccomplishments,
  normalizeExtractedAccomplishments,
  parseExtractJsonPayload,
  type NormalizedExtractedAccomplishment,
} from "@/lib/extract-accomplishments";

export const maxDuration = 60;

interface ExtractAccomplishmentsRequest {
  rawText: string;
  defaultCycleYear?: number;
  model?: string;
}

const DEFAULT_EXTRACT_MODEL = DEFAULT_APP_MODEL_ID;

function buildExtractPrompt(): string {
  const mpaList = ENTRY_MGAS.map((m) => `- "${m.key}": ${m.label}`).join("\n");

  const mpaDescriptions = Object.entries(DEFAULT_MPA_DESCRIPTIONS)
    .filter(([key]) => ENTRY_MGAS.some((m) => m.key === key))
    .map(([key, desc]) => `${key}: ${desc.description}`)
    .join("\n");

  return `You are an expert at turning messy Air Force performance notes into structured accomplishment entries for an EPB (Enlisted Performance Brief) log.

## MPA KEYS
${mpaList}

## MPA DESCRIPTIONS
${mpaDescriptions}

## YOUR TASK
The user will paste unstructured text: bullet lists, award packages, war stories, meeting notes, or polished EPB statements. Split it into discrete accomplishments suitable for logging.

## EXTRACTION RULES
1. Each item should be ONE distinct accomplishment (action + context). Prefer splitting compound dumps over merging unrelated wins.
2. Prefer concrete mission actions over soft narrative. If education appears, keep it as context inside details/impact — do not invent a separate "went to school" bullet unless it includes a mission action.
3. Pull metrics when present (numbers, %, $, hours, people). Put numeric evidence in "metrics" when possible; narrative result in "impact".
4. Choose an action_verb (past tense, Title Case preferred: Led, Directed, Executed).
5. Assign the best-fit MPA key. Use "miscellaneous" only when nothing else fits.
6. Skip headers, signatures, duty descriptions, and non-accomplishment fluff.
7. Cap at ${MAX_EXTRACTED_ACCOMPLISHMENTS} items. Prefer the strongest / most concrete items if over the cap.
8. Do NOT write polished EPB two-sentence packages — return entry fields the user can edit.

## GRAMMAR (required)
- Entry cards show "details" ALONE (not action_verb + details). "details" MUST be a complete standalone sentence that STARTS with the action_verb.
  - Good: action_verb "Led", details "Led teams of 36-65 personnel in 24/7 operations…"
  - Bad:  action_verb "Led", details "teams of 36-65 personnel in 24/7 operations…"
  - Bad:  details starting with "as …", "by …", "wing's …", "innovative solutions…"
- "impact" must also be a complete grammatical sentence or clause.
- Fix missing articles/prepositions and awkward fragments from the source notes.
- Do not invent new facts, numbers, names, units, or outcomes — only repair wording.
- Prefer past tense consistent with EPB logging.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences):
{
  "accomplishments": [
    {
      "action_verb": "Led",
      "details": "What they did — context, scope, who/what",
      "impact": "Result or outcome (optional)",
      "metrics": "Key numbers if any (optional)",
      "mpa": "executing_mission",
      "confidence": 0.0
    }
  ]
}

## CONFIDENCE
- 0.9+: clear discrete accomplishment with verb + result
- 0.6–0.8: usable but incomplete
- <0.6: weak / inferred — still include if salvageable`;
}

function buildGrammarPolishPrompt(): string {
  return `You clean up grammar for Air Force accomplishment log fields.

## TASK
Given a JSON array of extracted accomplishments, rewrite ONLY the prose fields so each is grammatical and complete.

## HARD RULES
1. Preserve every fact: numbers, %, $, hours, names, units, outcomes, scope.
2. Do NOT add new claims, metrics, or mission results.
3. Do NOT remove real metrics or outcomes that are already present.
4. Entry cards display "details" alone. details MUST be a full standalone sentence that BEGINS with action_verb.
   - Fix fragments like "teams of…", "as Wing…", "by AFSOUTH…", "wing's first…", "post-ingest tools…" by leading with the action_verb and completing the clause.
5. impact must be a complete sentence/clause (not a dangling fragment).
6. Keep tone plain and factual (entry log), not polished EPB package prose.
7. Keep the same array length and order.
8. Leave action_verb and mpa unchanged (echo them).
9. metrics stay compact.

## OUTPUT
Return ONLY valid JSON (no markdown fences):
{
  "accomplishments": [
    {
      "action_verb": "Led",
      "details": "Led teams of 36-65 personnel in 24/7 operations…",
      "impact": "Ensured availability for 1M+ users…",
      "metrics": "36-65 personnel; 730+ controllers",
      "mpa": "managing_resources",
      "confidence": 0.9
    }
  ]
}`;
}

async function polishAccomplishmentsGrammar(
  items: NormalizedExtractedAccomplishment[],
  llmModel: ReturnType<typeof getModelProvider>,
  userId: string,
): Promise<NormalizedExtractedAccomplishment[]> {
  if (items.length === 0) return items;

  const systemPrompt = await appendUserRulesToPrompt(
    buildGrammarPolishPrompt(),
    userId,
    "epb",
  );

  const { text: llmResponse } = await generateText({
    model: llmModel,
    system: systemPrompt,
    prompt: `Polish grammar only for these accomplishments:\n\n${JSON.stringify({ accomplishments: items })}`,
    temperature: 0.2,
    maxOutputTokens: 5000,
  });

  try {
    const parsed = parseExtractJsonPayload(llmResponse) as {
      accomplishments?: unknown;
    };
    return mergeGrammarPolishedAccomplishments(
      items,
      parsed.accomplishments,
    );
  } catch {
    console.error(
      "Failed to parse grammar-polish response; returning extract as-is:",
      llmResponse,
    );
    return mergeGrammarPolishedAccomplishments(items, null);
  }
}

export async function POST(request: Request) {
  let modelId = DEFAULT_EXTRACT_MODEL;
  let billableCtx: BillableRequestContext | null = null;
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ExtractAccomplishmentsRequest = await request.json();
    const { rawText, model = DEFAULT_EXTRACT_MODEL } = body;
    modelId = await resolveRequestedModel(model, "generate");

    if (!rawText || rawText.trim().length < 10) {
      return NextResponse.json(
        { error: "Please provide some text to extract" },
        { status: 400 },
      );
    }

    const { blocked, matches } = scanTextForLLM(rawText);
    if (blocked) {
      const types = [...new Set(matches.map((m) => m.label))].join(", ");
      return NextResponse.json(
        {
          error: `Sensitive data detected (${types}). Please remove sensitive data before extracting.`,
        },
        { status: 400 },
      );
    }

    const cleanedText = cleanText(rawText);

    const userKeys = await getDecryptedApiKeys();

    billableCtx = {
      ...(await createBillableRequestContext(request, user.id)),
      usageCheck: null,
    };

    const replayed = await getReplayedBillableResponse(billableCtx);
    if (replayed) return replayed;

    const usageCheck = await checkAndTrackUsage(
      user.id,
      "extract_accomplishments",
      modelId,
      userKeys,
      billableCtx.idempotencyKey,
    );
    billableCtx.usageCheck = usageCheck;
    if (!usageCheck.allowed) {
      return enforceUsageGate(usageCheck);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const llmModel = getModelProvider(effectiveModel, userKeys, usageCheck.tracking);

    const systemPrompt = await appendUserRulesToPrompt(
      buildExtractPrompt(),
      user.id,
      "epb",
    );

    const { text: llmResponse } = await generateText({
      model: llmModel,
      system: systemPrompt,
      prompt: `Extract discrete accomplishments from the following text:\n\n${cleanedText}`,
      temperature: 0.3,
      maxOutputTokens: 5000,
    });

    let parsedResult: { accomplishments?: unknown };

    try {
      parsedResult = parseExtractJsonPayload(llmResponse) as {
        accomplishments?: unknown;
      };
    } catch {
      console.error("Failed to parse extract-accomplishments LLM response:", llmResponse);
      return refundAndError(
        billableCtx,
        { error: "Failed to extract accomplishments. Please try again." },
        { status: 500 },
      );
    }

    const extracted = normalizeExtractedAccomplishments(
      parsedResult.accomplishments,
      MAX_EXTRACTED_ACCOMPLISHMENTS,
    );

    // Same credit: second pass only repairs grammar; facts stay put.
    const accomplishments = await polishAccomplishmentsGrammar(
      extracted,
      llmModel,
      user.id,
    );

    return cacheBillableJson(
      billableCtx,
      { accomplishments },
      usageCheck,
    );
  } catch (error) {
    if (billableCtx) {
      return handleBillableLLMError(
        error,
        "POST /api/extract-accomplishments",
        modelId,
        billableCtx,
      );
    }
    return handleLLMError(error, "POST /api/extract-accomplishments", modelId);
  }
}
