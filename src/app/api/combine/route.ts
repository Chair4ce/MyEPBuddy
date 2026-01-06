import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { formatAbbreviationsList } from "@/lib/default-abbreviations";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import type { Rank, UserLLMSettings } from "@/types/database";

// Legacy combine mode (two statements into one)
interface CombineRequest {
  mode?: "combine";
  statement1: string;
  statement2: string;
  mpa: string;
  afsc: string;
  rank: Rank;
  maxCharacters: number;
  model: string;
}

// New revise mode (draft statement with optional sources)
interface ReviseRequest {
  mode: "revise";
  draftStatement: string;
  sourceStatements?: string[];
  mpa: string;
  afsc: string;
  rank: Rank;
  maxCharacters: number;
  model: string;
}

type RequestBody = CombineRequest | ReviseRequest;

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

    const body: RequestBody = await request.json();
    const { mpa, afsc, rank, maxCharacters, model } = body;

    // Get user's LLM settings for abbreviations
    const { data: userSettings } = await supabase
      .from("user_llm_settings")
      .select("abbreviations")
      .eq("user_id", user.id)
      .maybeSingle();

    const abbreviations = (userSettings as unknown as UserLLMSettings)?.abbreviations || [];
    const abbreviationsList = abbreviations.length > 0 
      ? formatAbbreviationsList(abbreviations)
      : "Use standard AF abbreviations (Amn, NCO, SNCO, sq, flt, hrs, etc.)";

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    const modelProvider = getModelProvider(model, userKeys);

    let systemPrompt: string;
    let userPrompt: string;

    // Handle revise mode (new workspace mode)
    if (body.mode === "revise") {
      const { draftStatement, sourceStatements } = body;

      if (!draftStatement) {
        return NextResponse.json(
          { error: "Draft statement is required" },
          { status: 400 }
        );
      }

      systemPrompt = `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant. Your task is to help refine and improve a draft EPB statement while maintaining the user's intent and voice.

CRITICAL RULES:
1. The refined statement MUST be ${maxCharacters} characters or fewer. This is a HARD limit.
2. The statement MUST be a single, complete sentence.
3. NEVER use semi-colons. Use commas or em-dashes (--) to connect clauses.
4. Preserve the user's core message and intent.
5. Chain impacts: action → immediate result → organizational benefit.
6. Use active voice and strong action verbs appropriate for ${rank} rank.
7. Maintain military writing style and standard AF abbreviations.

ABBREVIATIONS TO USE:
${abbreviationsList}

REFINEMENT STRATEGY:
1. Understand the user's draft intent and key points
2. Identify opportunities to strengthen action verbs
3. Enhance impact statements with quantifiable results where possible
4. Improve flow and readability
5. Ensure proper EPB structure: Action + Context + Impact
6. Maximize character usage while staying under the limit

IMPORTANT: Generate EXACTLY 3 refined versions. Each should approach the refinement differently:
- Version 1: Polish and tighten the existing draft (minimal changes, improved flow)
- Version 2: Strengthen with more powerful verbs and enhanced impact language
- Version 3: Restructure for maximum impact while preserving core content`;

      const sourceContext = sourceStatements && sourceStatements.length > 0
        ? `\n\nSOURCE STATEMENTS (user selected these as reference/inspiration):
${sourceStatements.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
        : "";

      userPrompt = `Refine this EPB draft statement.

USER'S DRAFT:
${draftStatement}
${sourceContext}

TARGET MPA: ${mpa}
RANK: ${rank}
AFSC: ${afsc}
CHARACTER LIMIT: ${maxCharacters} (STRICT - do not exceed)

Generate EXACTLY 3 refined versions, each within ${maxCharacters} characters.
Preserve the user's intent while improving quality.

Format as JSON array only:
["Refined version 1", "Refined version 2", "Refined version 3"]`;

    } else {
      // Legacy combine mode (combining two statements)
      const { statement1, statement2 } = body as CombineRequest;

      if (!statement1 || !statement2) {
        return NextResponse.json(
          { error: "Both statements are required" },
          { status: 400 }
        );
      }

      if (!mpa) {
        return NextResponse.json(
          { error: "MPA is required" },
          { status: 400 }
        );
      }

      systemPrompt = `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant. Your task is to combine two existing EPB statements into a single, powerful statement that captures the essence of both while fitting within a strict character limit.

CRITICAL RULES:
1. The combined statement MUST be ${maxCharacters} characters or fewer. This is a HARD limit.
2. The statement MUST be a single, complete sentence.
3. NEVER use semi-colons. Use commas or em-dashes (--) to connect clauses.
4. Preserve the most impactful actions, metrics, and results from both statements.
5. Chain impacts: action → immediate result → organizational benefit.
6. Use active voice and strong action verbs appropriate for ${rank} rank.
7. Maintain military writing style and standard AF abbreviations.

ABBREVIATIONS TO USE:
${abbreviationsList}

COMBINATION STRATEGY:
1. Identify the core action and impact from each statement
2. Find common themes or complementary achievements
3. Synthesize into a flowing narrative that maximizes impact
4. Prioritize quantifiable metrics and mission-critical outcomes
5. Ensure the final statement reads naturally, not like two statements glued together

IMPORTANT: Generate EXACTLY 3 different combined versions. Each should approach the combination differently:
- Version 1: Focus on the primary action/impact synthesis
- Version 2: Emphasize metrics and quantifiable results
- Version 3: Highlight strategic/mission-level impact`;

      userPrompt = `Combine these two EPB statements into ONE powerful statement.

STATEMENT 1:
${statement1}

STATEMENT 2:
${statement2}

TARGET MPA: ${mpa}
RANK: ${rank}
AFSC: ${afsc}
CHARACTER LIMIT: ${maxCharacters} (STRICT - do not exceed)

Generate EXACTLY 3 different combined versions, each within ${maxCharacters} characters.

Format as JSON array only:
["Combined version 1", "Combined version 2", "Combined version 3"]`;
    }

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.75,
      maxTokens: 1500,
    });

    let statements: string[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        statements = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try to extract statements from text
        statements = text
          .split("\n")
          .filter((line) => line.trim().length > 50)
          .slice(0, 3);
      }
    } catch {
      // Fallback parsing
      statements = text
        .split("\n")
        .filter((line) => line.trim().length > 50)
        .slice(0, 3);
    }

    // Ensure we have at least one statement
    if (statements.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate statements" },
        { status: 500 }
      );
    }

    // Trim to exactly 3 statements
    statements = statements.slice(0, 3);

    return NextResponse.json({ statements });
  } catch (error) {
    console.error("Combine API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
