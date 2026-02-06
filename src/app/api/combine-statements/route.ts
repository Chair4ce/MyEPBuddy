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

interface CombineRequest {
  statements: string[];
  targetChars: number;
  model: string;
  mpa: string;
}

function getModelProvider(model: string, userKeys: Record<string, string | null>) {
  const modelMappings: Record<string, { provider: string; modelId: string }> = {
    "gpt-4o": { provider: "openai", modelId: "gpt-4o" },
    "gpt-4o-mini": { provider: "openai", modelId: "gpt-4o-mini" },
    "gpt-4.1": { provider: "openai", modelId: "gpt-4.1" },
    "gpt-4.1-mini": { provider: "openai", modelId: "gpt-4.1-mini" },
    "gpt-4.1-nano": { provider: "openai", modelId: "gpt-4.1-nano" },
    "claude-sonnet-4-20250514": { provider: "anthropic", modelId: "claude-sonnet-4-20250514" },
    "claude-3-7-sonnet-20250219": { provider: "anthropic", modelId: "claude-3-7-sonnet-20250219" },
    "claude-3-5-sonnet-20241022": { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022" },
    "claude-3-5-haiku-20241022": { provider: "anthropic", modelId: "claude-3-5-haiku-20241022" },
    "gemini-2.0-flash": { provider: "google", modelId: "gemini-2.0-flash" },
    "gemini-2.5-flash-preview-05-20": { provider: "google", modelId: "gemini-2.5-flash-preview-05-20" },
    "gemini-2.5-pro-preview-05-06": { provider: "google", modelId: "gemini-2.5-pro-preview-05-06" },
    "grok-3": { provider: "xai", modelId: "grok-3" },
    "grok-3-fast": { provider: "xai", modelId: "grok-3-fast" },
    "grok-3-mini": { provider: "xai", modelId: "grok-3-mini" },
    "grok-3-mini-fast": { provider: "xai", modelId: "grok-3-mini-fast" },
  };

  const mapping = modelMappings[model] || { provider: "openai", modelId: "gpt-4o-mini" };

  switch (mapping.provider) {
    case "anthropic": {
      const key = userKeys.anthropic || process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("Anthropic API key not configured");
      const anthropic = createAnthropic({ apiKey: key });
      return anthropic(mapping.modelId);
    }
    case "google": {
      const key = userKeys.google || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!key) throw new Error("Google AI API key not configured");
      const google = createGoogleGenerativeAI({ apiKey: key });
      return google(mapping.modelId);
    }
    case "xai": {
      const key = userKeys.xai || process.env.XAI_API_KEY;
      if (!key) throw new Error("xAI API key not configured");
      const xai = createXai({ apiKey: key });
      return xai(mapping.modelId);
    }
    default: {
      const key = userKeys.openai || process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OpenAI API key not configured");
      const openai = createOpenAI({ apiKey: key });
      return openai(mapping.modelId);
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CombineRequest = await request.json();
    const { statements, targetChars, model, mpa } = body;

    if (!statements || statements.length === 0) {
      return NextResponse.json({ error: "No statements provided" }, { status: 400 });
    }

    // Get user API keys (decrypted)
    const apiKeys = await getDecryptedApiKeys();

    const userKeys = {
      openai: apiKeys?.openai_key || null,
      anthropic: apiKeys?.anthropic_key || null,
      google: apiKeys?.google_key || null,
      xai: apiKeys?.grok_key || null,
    };

    const modelProvider = getModelProvider(model, userKeys);

    const systemPrompt = `You are an expert Air Force EPB statement writer. Your task is to combine multiple performance statements into ONE cohesive, high-quality statement.

RULES:
1. The combined statement MUST be ${targetChars} characters or less
2. READABILITY IS #1 PRIORITY: Combined statement must be scannable in 2-3 seconds
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses total - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent tense throughout)
   - Place the STRONGEST IMPACT at the END
   - If it sounds like a run-on when read aloud, prioritize the most impactful elements
4. Preserve the most important metrics and impacts from each source
5. Create a flowing narrative that connects accomplishments naturally
6. NEVER use: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"
7. Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered
8. Format: [Action] + [Scope/Details] + [BIGGEST IMPACT LAST]
9. Do NOT use bullet points or numbered lists
10. Output ONLY the combined statement text, no quotes or explanation`;

    const userPrompt = `Combine these ${statements.length} EPB statements into ONE statement of ${targetChars} characters or less:

${statements.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}

MPA: ${mpa}
TARGET LENGTH: ${targetChars} characters maximum

CRITICAL REQUIREMENTS:
- Maximum 3-4 action clauses total - do NOT create a run-on laundry list
- Use PARALLEL verb structure throughout
- Place the STRONGEST IMPACT at the END
- Prioritize the most impactful metrics and results if you can't fit everything
- The combined statement must be readable in 2-3 seconds

GOOD EXAMPLE:
"Led 12 Airmen in rapid overhaul of 8 authentication servers, delivering wing directive 29 days ahead of schedule, ensuring uninterrupted network access for 58K users."

BAD EXAMPLE:
"Directed 12 Amn rebuilding 8 servers, advancing completion by 29 days, crafted assessment, fixed errors, purged data, averting outage, streamlining access."

Output ONLY the combined statement.`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    // Clean up the response
    const combined = text.trim().replace(/^["']|["']$/g, "");

    return NextResponse.json({ combined });
  } catch (error) {
    console.error("Combine statements error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to combine statements" },
      { status: 500 }
    );
  }
}

