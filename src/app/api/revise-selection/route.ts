import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

interface ReviseSelectionRequest {
  fullStatement: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  model: string;
  mode?: "expand" | "compress" | "general"; // expand = longer words, compress = shorter words
  context?: string; // Additional context for revision
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

    const body: ReviseSelectionRequest = await request.json();
    const { fullStatement, selectedText, selectionStart, selectionEnd, model, mode = "general", context } = body;

    if (!fullStatement || !selectedText) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user API keys
    const { data: userKeysData } = await supabase
      .from("user_api_keys")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const userKeys = userKeysData as unknown as {
      openai_key?: string | null;
      anthropic_key?: string | null;
      google_key?: string | null;
      grok_key?: string | null;
    } | null;

    const modelProvider = getModelProvider(model, userKeys);

    const beforeSelection = fullStatement.substring(0, selectionStart);
    const afterSelection = fullStatement.substring(selectionEnd);

    // Build mode-specific instructions
    const modeInstructions = {
      expand: `**MODE: EXPAND (use longer words to fill more space)**
Your goal is to make the selected text LONGER by:
- Using longer, more descriptive words (e.g., "led" → "spearheaded", "cut" → "eliminated", "helped" → "facilitated")
- Adding impactful adjectives and adverbs where natural
- Expanding any abbreviations to full words
- Using more elaborate phrasing while maintaining meaning
- Target length: ${Math.round(selectedText.length * 1.2)}-${Math.round(selectedText.length * 1.4)} characters (20-40% longer)`,
      
      compress: `**MODE: COMPRESS (use shorter words to save space)**
Your goal is to make the selected text SHORTER by:
- Using shorter, punchier words (e.g., "spearheaded" → "led", "facilitated" → "helped", "eliminated" → "cut", "approximately" → "about")
- Removing unnecessary filler words while keeping meaning
- Using more concise phrasing
- Combining phrases where possible
- DO NOT use abbreviations - use full words only, just shorter ones
- Target length: ${Math.round(selectedText.length * 0.65)}-${Math.round(selectedText.length * 0.85)} characters (15-35% shorter)`,
      
      general: `**MODE: IMPROVE (general quality improvement)**
Your goal is to improve the selected text while keeping similar length:
- Strengthen action verbs
- Improve quantification and impact
- Enhance clarity and flow
- DO NOT use abbreviations unless they were in the original
- Target length: ~${selectedText.length} characters (within 20% of original)`,
    };

    const systemPrompt = `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

Your task is to rewrite ONLY the selected portion of text while maintaining coherence with the surrounding context.

${modeInstructions[mode]}

**FORBIDDEN PUNCTUATION (DO NOT USE UNDER ANY CIRCUMSTANCES):**
- Em-dashes: -- (ABSOLUTELY NEVER use these)
- Semicolons: ;
- Slashes: /

**USE ONLY:** Commas (,) to connect clauses

CRITICAL RULES:
1. Output ONLY the revised text for the selected portion - no quotes, no explanation
2. Maintain the same general meaning and tone
3. Maintain grammatical coherence with surrounding text
4. NEVER use em-dashes (--) - use COMMAS instead to connect clauses
5. NEVER use semicolons or slashes
6. If the selection starts at the beginning of the statement and includes "- ", preserve the "- " prefix`;

    const userPrompt = `FULL STATEMENT FOR CONTEXT:
"${fullStatement}"

TEXT BEFORE SELECTION:
"${beforeSelection}"

SELECTED TEXT TO REVISE (${selectedText.length} chars):
"${selectedText}"

TEXT AFTER SELECTION:
"${afterSelection}"

${context ? `ADDITIONAL GUIDANCE: ${context}` : ""}

MODE: ${mode.toUpperCase()}
${mode === "expand" ? "Make it LONGER with more descriptive words." : mode === "compress" ? "Make it SHORTER with concise words and abbreviations." : "Improve quality while keeping similar length."}

Generate 3 alternative versions of ONLY the selected portion.

Return ONLY a JSON array with 3 revised versions:
["revised version 1", "revised version 2", "revised version 3"]`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.8,
      maxTokens: 500,
    });

    let revisions: string[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        revisions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: split by newlines if JSON parsing fails
      revisions = text.split("\n").filter(line => line.trim().length > 10).slice(0, 3);
    }

    // Ensure we have at least one revision
    if (revisions.length === 0) {
      revisions = [selectedText]; // Return original if nothing generated
    }

    return NextResponse.json({ 
      revisions,
      original: selectedText,
    });
  } catch (error) {
    console.error("Revise Selection API error:", error);
    return NextResponse.json(
      { error: "Failed to revise selection" },
      { status: 500 }
    );
  }
}

