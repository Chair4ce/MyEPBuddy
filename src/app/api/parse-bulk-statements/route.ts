import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { STANDARD_MGAS, DEFAULT_MPA_DESCRIPTIONS } from "@/lib/constants";
import { cleanText, extractDateRange, extractCycleYear } from "@/lib/text-cleaning";
import type { Rank } from "@/types/database";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface ParseBulkStatementsRequest {
  rawText: string;
  mpaDetectionMode: "auto" | "manual";
  manualMpa?: string;
  statementType: "epb" | "award";
  defaultCycleYear: number;
  defaultAfsc: string;
  defaultRank: Rank;
  model?: string;
}

// Default to Gemini Flash as the app's fallback model (has env key configured)
const DEFAULT_PARSE_MODEL = "gemini-2.0-flash";

interface ParsedStatement {
  id: string;
  text: string;
  detectedMpa: string | null;
  confidenceScore: number;
  cycleYear: number | null;
  afsc: string;
  rank: Rank;
  needsReview: boolean;
}

interface ParseBulkStatementsResponse {
  statements: ParsedStatement[];
  extractedDateRange: { start: string; end: string } | null;
  extractedCycleYear: number | null;
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
      const apiKey = userKeys?.anthropic_key || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Fallback to Gemini if no Anthropic key
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_PARSE_MODEL);
      }
      const customAnthropic = createAnthropic({ apiKey });
      return customAnthropic(modelId);
    }
    case "google": {
      const customGoogle = createGoogleGenerativeAI({
        apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
      });
      return customGoogle(modelId);
    }
    case "xai": {
      const apiKey = userKeys?.grok_key || process.env.XAI_API_KEY;
      if (!apiKey) {
        // Fallback to Gemini if no xAI key
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_PARSE_MODEL);
      }
      const customXai = createXai({ apiKey });
      return customXai(modelId);
    }
    default: {
      const apiKey = userKeys?.openai_key || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        // Fallback to Gemini if no OpenAI key
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_PARSE_MODEL);
      }
      const customOpenai = createOpenAI({ apiKey });
      return customOpenai(modelId);
    }
  }
}

function buildParsingPrompt(mpaDetectionMode: "auto" | "manual", manualMpa?: string): string {
  const mpaList = STANDARD_MGAS
    .filter(m => m.key !== "hlr_assessment")
    .map(m => `- "${m.key}": ${m.label}`)
    .join("\n");

  const mpaDescriptions = Object.entries(DEFAULT_MPA_DESCRIPTIONS)
    .filter(([key]) => key !== "hlr_assessment")
    .map(([key, desc]) => `${key}: ${desc.description}`)
    .join("\n");

  return `You are an expert at parsing Air Force Enlisted Performance Brief (EPB) text. Your task is to extract individual performance statements from raw EPB text.

## MPA KEYS AND LABELS
${mpaList}

## MPA DESCRIPTIONS (use for classification)
${mpaDescriptions}

## YOUR TASK
Parse the provided text and extract individual performance statements. Each statement typically consists of 1-2 sentences describing an accomplishment with action, result, and impact.

## EXTRACTION RULES
1. **Split compound statements**: EPB statements often have 2 sentences (action + result). Keep these together as a single statement.
2. **Clean the text**: Remove system-generated headers, page numbers, signatures, and metadata.
3. **Identify MPA context**: Look for MPA headers like "EXECUTING THE MISSION", "LEADING PEOPLE", "MANAGING RESOURCES", "IMPROVING THE UNIT" in the text.
4. **Character cleanup**: Convert smart quotes to regular quotes, fix unicode issues.
5. **Skip non-statement text**: Ignore duty descriptions, section headers, signatures, and administrative text.

## MPA DETECTION MODE: ${mpaDetectionMode === "auto" ? "AUTO-DETECT" : "MANUAL (use provided MPA)"}
${mpaDetectionMode === "manual" ? `Use MPA key: "${manualMpa}" for all statements.` : "Detect MPA from context. Look for headers or infer from content."}

## MPA HEADER PATTERNS TO LOOK FOR
- "EXECUTING THE MISSION" or "RATER ASSESSMENT EXECUTING" → executing_mission
- "LEADING PEOPLE" → leading_people  
- "MANAGING RESOURCES" → managing_resources
- "IMPROVING THE UNIT" → improving_unit

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{
  "statements": [
    {
      "text": "The cleaned statement text as a single or two-sentence statement",
      "detectedMpa": "executing_mission" | "leading_people" | "managing_resources" | "improving_unit" | null,
      "confidenceScore": 0.0 to 1.0,
      "reasoning": "Brief explanation of why this MPA was assigned"
    }
  ]
}

## CONFIDENCE SCORING
- 1.0: MPA header directly precedes the statement
- 0.8: Clear keywords match MPA description  
- 0.5: Inferred from content (less certain)
- 0.3: Best guess based on weak signals
- null: Cannot determine MPA (set detectedMpa to null)

## IMPORTANT
- Return ONLY valid JSON, no markdown code blocks
- Each statement should be 50-400 characters
- Skip statements that are too short (<50 chars) or don't look like accomplishments
- If a statement spans multiple MPA sections, assign it to the most prominent MPA`;
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

    const body: ParseBulkStatementsRequest = await request.json();
    const {
      rawText,
      mpaDetectionMode,
      manualMpa,
      statementType,
      defaultCycleYear,
      defaultAfsc,
      defaultRank,
      model = DEFAULT_PARSE_MODEL,
    } = body;

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json(
        { error: "Please provide text to parse (minimum 50 characters)" },
        { status: 400 }
      );
    }

    // Clean the raw text first
    const cleanedText = cleanText(rawText);

    // Extract date range and cycle year from the text
    const extractedDateRange = extractDateRange(cleanedText);
    const extractedCycleYear = extractCycleYear(cleanedText);

    // Get user API keys
    const userKeys = await getDecryptedApiKeys();

    // Get the LLM model
    const llmModel = getModelProvider(model, userKeys);

    // Build the parsing prompt
    const systemPrompt = buildParsingPrompt(mpaDetectionMode, manualMpa);

    // Call the LLM to parse statements
    const { text: llmResponse } = await generateText({
      model: llmModel,
      system: systemPrompt,
      prompt: `Parse the following EPB text and extract individual performance statements:\n\n${cleanedText}`,
      temperature: 0.3, // Lower temperature for more consistent parsing
      maxTokens: 4000,
    });

    // Parse the LLM response
    let parsedResult: { statements: Array<{ text: string; detectedMpa: string | null; confidenceScore: number; reasoning?: string }> };

    try {
      // Try to extract JSON from the response (handle potential markdown code blocks)
      let jsonStr = llmResponse.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }
      parsedResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse LLM response:", llmResponse);
      return NextResponse.json(
        { error: "Failed to parse statements. Please try again." },
        { status: 500 }
      );
    }

    // Transform the parsed statements
    const statements: ParsedStatement[] = parsedResult.statements
      .filter(s => s.text && s.text.length >= 50 && s.text.length <= 500)
      .map((s, index) => ({
        id: `stmt-${Date.now()}-${index}`,
        text: s.text.trim(),
        detectedMpa: mpaDetectionMode === "manual" && manualMpa ? manualMpa : s.detectedMpa,
        confidenceScore: mpaDetectionMode === "manual" ? 1.0 : s.confidenceScore,
        cycleYear: extractedCycleYear || defaultCycleYear,
        afsc: defaultAfsc,
        rank: defaultRank,
        needsReview: s.detectedMpa === null || s.confidenceScore < 0.7,
      }));

    const response: ParseBulkStatementsResponse = {
      statements,
      extractedDateRange,
      extractedCycleYear,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error parsing bulk statements:", error);
    return NextResponse.json(
      { error: "Failed to parse statements" },
      { status: 500 }
    );
  }
}
