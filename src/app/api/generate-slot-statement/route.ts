import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

interface AccomplishmentData {
  action_verb: string;
  details: string;
  impact: string;
  metrics?: string | null;
}

interface GenerateSlotRequest {
  accomplishments: AccomplishmentData[];
  targetChars: number;
  model: string;
  mpa: string;
  rateeRank: string;
  rateeAfsc: string;
}

// Banned overused verbs
const BANNED_VERBS = [
  "spearheaded",
  "orchestrated", 
  "synergized",
  "leveraged",
  "impacted",
  "utilized",
  "facilitated",
];

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

    const body: GenerateSlotRequest = await request.json();
    const { accomplishments, targetChars, model, mpa, rateeRank, rateeAfsc } = body;

    if (!accomplishments || accomplishments.length === 0) {
      return NextResponse.json({ error: "No accomplishments provided" }, { status: 400 });
    }

    // Get user API keys
    const { data: apiKeys } = await supabase
      .from("user_api_keys")
      .select("openai_key, anthropic_key, google_key, grok_key")
      .eq("user_id", user.id)
      .single() as { data: { openai_key: string | null; anthropic_key: string | null; google_key: string | null; grok_key: string | null } | null };

    const userKeys = {
      openai: apiKeys?.openai_key || null,
      anthropic: apiKeys?.anthropic_key || null,
      google: apiKeys?.google_key || null,
      xai: apiKeys?.grok_key || null,
    };

    const modelProvider = getModelProvider(model, userKeys);

    const systemPrompt = `You are an expert Air Force EPB statement writer. Generate ONE high-density EPB narrative statement from the provided accomplishments.

CRITICAL RULES:
1. The statement MUST be ${targetChars} characters or LESS - this is a hard limit
2. If multiple accomplishments are provided, synthesize them into ONE cohesive statement
3. Preserve the most important metrics and impacts
4. Use strong action verbs - NEVER use: ${BANNED_VERBS.map(v => `"${v}"`).join(", ")}
5. Use alternatives like: Led, Directed, Drove, Championed, Transformed, Pioneered, Accelerated
6. Structure: [Action] + [Details with metrics] + [Impact chain]
7. Do NOT use bullet points or numbered lists
8. Do NOT end with a period (the system will add one when combining statements)
9. Output ONLY the statement text, no quotes or explanation

CHARACTER LIMIT: ${targetChars} (aim for ${Math.floor(targetChars * 0.9)}-${targetChars})`;

    const accomplishmentText = accomplishments.map((a, i) => 
      `[${i + 1}] Action: ${a.action_verb}
   Details: ${a.details}
   Impact: ${a.impact}
   ${a.metrics ? `Metrics: ${a.metrics}` : ""}`
    ).join("\n\n");

    const userPrompt = `Generate ONE EPB statement for the "${mpa}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc}

SOURCE ACCOMPLISHMENTS:
${accomplishmentText}

${accomplishments.length > 1 ? `
IMPORTANT: Synthesize ALL ${accomplishments.length} accomplishments into ONE flowing statement. 
Combine related actions and chain the impacts together.
` : ""}

TARGET LENGTH: ${targetChars} characters maximum (aim for ${Math.floor(targetChars * 0.9)}-${targetChars})

Output ONLY the statement (no period at the end).`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    // Clean up the response
    let statement = text.trim().replace(/^["']|["']$/g, "");
    
    // Remove trailing period if present (we add it when combining)
    if (statement.endsWith(".")) {
      statement = statement.slice(0, -1);
    }

    return NextResponse.json({ statement });
  } catch (error) {
    console.error("Generate slot statement error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate statement" },
      { status: 500 }
    );
  }
}

