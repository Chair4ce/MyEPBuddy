import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface SynonymRequest {
  word: string;
  fullStatement: string;
  model: string;
  context?: "epb" | "decoration" | "award"; // Type of document for better suggestions
}

function getModelProvider(
  modelId: string,
  userKeys: {
    openai_key?: string | null;
    anthropic_key?: string | null;
    google_key?: string | null;
    grok_key?: string | null;
  } | null
) {
  const provider = modelId.includes("claude")
    ? "anthropic"
    : modelId.includes("gemini")
      ? "google"
      : modelId.includes("grok")
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SynonymRequest = await request.json();
    const { word, fullStatement, model, context = "epb" } = body;

    if (!word || !fullStatement) {
      return NextResponse.json(
        { error: "Word and full statement are required" },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    const modelProvider = getModelProvider(model, userKeys);

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

    const systemPrompt = `You are an expert military writing assistant specializing in Air Force performance and recognition documents. Your task is to suggest context-appropriate synonyms for a specific word within a ${docType.name}.

GUIDELINES:
1. **ANALYZE THE FULL CONTEXT** - Read the entire statement to understand how the word is used
2. ${docType.guidance}
3. Prioritize words that:
   - Fit grammatically in the exact same position
   - Maintain or enhance the professional, action-oriented tone
   - Are commonly used in Air Force writing
4. Include a mix of:
   - Direct synonyms that fit the context perfectly
   - Stronger/more impactful alternatives
   - Military-appropriate terminology
5. Each suggestion MUST be grammatically correct when substituted directly
6. Keep suggestions concise (preferably single words, short phrases only if needed)
7. Order suggestions from MOST relevant/impactful to least

IMPORTANT: Return ONLY a JSON array of 10-15 synonyms/alternatives.`;

    const userPrompt = `Find synonyms for the word "${word}" in this ${docType.name}:

"${fullStatement}"

The word "${word}" appears in the context above. Consider:
- What part of speech is this word? (verb, noun, adjective, etc.)
- What tone and formality level fits this document?
- What synonyms would a senior Air Force leader use?

Provide 10-15 context-appropriate alternatives, ordered from most to least impactful.

Return ONLY a JSON array of strings:
["synonym1", "synonym2", "synonym3", ...]`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    let synonyms: string[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        synonyms = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: try to extract words from text
      synonyms = text
        .split(/[,\n]/)
        .map((s) => s.replace(/["\[\]]/g, "").trim())
        .filter((s) => s.length > 0 && s.length < 50);
    }

    // Clean up and deduplicate
    synonyms = [...new Set(synonyms.map((s) => s.toLowerCase().trim()))]
      .filter((s) => s.length > 0 && s !== word.toLowerCase())
      .slice(0, 15);

    return NextResponse.json({ synonyms });
  } catch (error) {
    console.error("Synonyms API error:", error);
    return NextResponse.json(
      { error: "Failed to generate synonyms" },
      { status: 500 }
    );
  }
}


