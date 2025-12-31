import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";

export const maxDuration = 60;

interface AdaptSentenceRequest {
  sentence1: string;
  sentence2: string;
  targetMax: number;
  mpaContext: string; // e.g., "Executing the Mission"
  preserveSentenceIndex: number; // Which sentence to try to preserve more (0 or 1)
}

// Get model provider for a specific model
function getModelProvider(
  modelId: string,
  userKeys?: {
    openai_key?: string | null;
    anthropic_key?: string | null;
    google_key?: string | null;
    grok_key?: string | null;
  } | null
) {
  const provider = modelId.startsWith("claude")
    ? "anthropic"
    : modelId.startsWith("gemini")
      ? "google"
      : modelId.startsWith("grok")
        ? "xai"
        : "openai";

  switch (provider) {
    case "anthropic": {
      const customAnthropic = createAnthropic({
        apiKey: userKeys?.anthropic_key || process.env.ANTHROPIC_API_KEY || "",
      });
      return customAnthropic(modelId);
    }
    case "google": {
      const customGoogle = createGoogleGenerativeAI({
        apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
      });
      return customGoogle(modelId);
    }
    case "xai": {
      const customXai = createXai({
        apiKey: userKeys?.grok_key || process.env.XAI_API_KEY || "",
      });
      return customXai(modelId);
    }
    default: {
      const customOpenai = createOpenAI({
        apiKey: userKeys?.openai_key || process.env.OPENAI_API_KEY || "",
      });
      return customOpenai(modelId);
    }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: AdaptSentenceRequest = await req.json();
  const { sentence1, sentence2, targetMax, mpaContext, preserveSentenceIndex } = body;

  if (!sentence1 && !sentence2) {
    return NextResponse.json({ error: "At least one sentence is required" }, { status: 400 });
  }

  // Get user's LLM settings and API keys
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("preferred_model")
    .eq("user_id", user.id)
    .single<{ preferred_model: string | null }>();
  
  const userKeys = await getDecryptedApiKeys();
  const model = userSettings?.preferred_model || "gpt-4o-mini";
  const modelProvider = getModelProvider(model, userKeys);

  const currentLength = (sentence1?.length || 0) + (sentence2?.length || 0) + (sentence1 && sentence2 ? 1 : 0);
  const needsTrimming = currentLength > targetMax;
  const charsToTrim = needsTrimming ? currentLength - targetMax : 0;
  const availableSpace = !needsTrimming ? targetMax - currentLength : 0;

  const systemPrompt = `You are an expert military performance report writer specializing in Air Force EPBs (Enlisted Performance Briefs). Your task is to adapt two sentences to fit within a specific character limit while preserving the meaning and impact.

CRITICAL RULES:
1. The combined result MUST be ${targetMax} characters or less (currently ${currentLength} chars)
2. ${needsTrimming ? `You need to trim approximately ${charsToTrim} characters` : `You have ${availableSpace} extra characters available`}
3. Preserve the core accomplishments, metrics, and impact
4. Use standard Air Force abbreviations to save space when needed
5. Maintain professional military writing style
6. Keep both sentences if possible, but you may merge them if necessary
7. ${preserveSentenceIndex === 0 ? "Try to preserve Sentence 1 more than Sentence 2" : "Try to preserve Sentence 2 more than Sentence 1"}
8. The result should read naturally as a complete ${mpaContext} statement

ABBREVIATION GUIDANCE:
- Use standard abbreviations: Amn, NCO, msn, ops, trng, mgmt, maint, sys, etc.
- Remove unnecessary words like "the", "a", "an" where appropriate
- Combine similar concepts when possible`;

  const userPrompt = `Adapt these two sentences to fit within ${targetMax} characters for the "${mpaContext}" MPA section:

SENTENCE 1 (${sentence1?.length || 0} chars):
${sentence1 || "(empty)"}

SENTENCE 2 (${sentence2?.length || 0} chars):
${sentence2 || "(empty)"}

CURRENT TOTAL: ${currentLength} characters
TARGET MAX: ${targetMax} characters
${needsTrimming ? `MUST TRIM: ${charsToTrim} characters` : `EXTRA SPACE: ${availableSpace} characters`}

Return ONLY the adapted statement (both sentences combined). Do not include any explanation or character counts.`;

  try {
    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    const adaptedStatement = text.trim();

    // Verify the result fits
    if (adaptedStatement.length > targetMax) {
      // If still too long, try a more aggressive trim
      const trimmedStatement = adaptedStatement.slice(0, targetMax - 3) + "...";
      return NextResponse.json({ 
        adaptedStatement: trimmedStatement,
        originalLength: currentLength,
        newLength: trimmedStatement.length,
        wasTruncated: true,
      });
    }

    return NextResponse.json({ 
      adaptedStatement,
      originalLength: currentLength,
      newLength: adaptedStatement.length,
      wasTruncated: false,
    });
  } catch (error) {
    console.error("Adapt sentence error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to adapt sentence" },
      { status: 500 }
    );
  }
}
