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

// Default to Gemini Flash as the app's fallback model
const DEFAULT_MODEL = "gemini-2.0-flash";

interface WARCategory {
  key: string;
  label: string;
  description: string;
  order: number;
}

interface WAREntry {
  id: string;
  author_name: string;
  author_rank: string | null;
  date: string;
  action_verb: string;
  details: string;
  impact: string | null;
  metrics: string | null;
  mpa: string;
  mpa_label: string;
}

interface GenerateWARRequest {
  entries: WAREntry[];
  categories: WARCategory[];
  weekStart: string;
  weekEnd: string;
  unitOfficeSymbol: string | null;
  synthesisInstructions: string | null;
  preparedBy: string;
  model?: string;
}

interface WARReport {
  header: {
    date_range: string;
    unit_office_symbol: string | null;
    prepared_by: string;
  };
  categories: {
    key: string;
    label: string;
    items: string[];
  }[];
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
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_MODEL);
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
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_MODEL);
      }
      const customXai = createXai({ apiKey });
      return customXai(modelId);
    }
    default: {
      const apiKey = userKeys?.openai_key || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const customGoogle = createGoogleGenerativeAI({
          apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        });
        return customGoogle(DEFAULT_MODEL);
      }
      const customOpenai = createOpenAI({ apiKey });
      return customOpenai(modelId);
    }
  }
}

function buildWARPrompt(
  entries: WAREntry[],
  categories: WARCategory[],
  synthesisInstructions: string | null
): string {
  // Sort categories by order
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  // Format entries for the prompt
  const entriesText = entries
    .map((e, i) => {
      const parts = [
        `Entry ${i + 1}:`,
        `  Author: ${e.author_rank ? `${e.author_rank} ` : ""}${e.author_name}`,
        `  Date: ${e.date}`,
        `  MPA: ${e.mpa_label}`,
        `  Action: ${e.action_verb}`,
        `  Details: ${e.details}`,
      ];
      if (e.impact) parts.push(`  Impact: ${e.impact}`);
      if (e.metrics) parts.push(`  Metrics: ${e.metrics}`);
      return parts.join("\n");
    })
    .join("\n\n");

  // Format categories for the prompt
  const categoriesText = sortedCategories
    .map((c, i) => `${i + 1}. "${c.key}" - ${c.label}\n   Description: ${c.description}`)
    .join("\n\n");

  const defaultInstructions = `
- Synthesize the entries into a concise, actionable format
- Use bullet points rather than lengthy narratives
- Structure each bullet as: [Action taken] + [Result/Impact]
- Keep each bullet to 1-2 sentences maximum
- Use no pronouns (avoid "he", "she", "they")
- Include specific, measurable, and relevant language
- Focus on the "so what" - why did this matter?
- Combine similar entries when appropriate to avoid redundancy
- If an entry doesn't fit any category well, use your best judgment to place it in the most relevant one
`;

  return `You are an expert military staff officer creating a Weekly Activity Report (WAR) / Situation Report (SITREP) for leadership.

## YOUR TASK
Analyze the team accomplishments below and organize them into the specified categories. Synthesize multiple entries where appropriate to create a concise, impactful report.

## CATEGORIES
The report must use these exact categories in this order:

${categoriesText}

## SYNTHESIS GUIDELINES
${synthesisInstructions || defaultInstructions}

## TEAM ENTRIES TO SYNTHESIZE
${entriesText}

## OUTPUT FORMAT
Return a valid JSON object with this exact structure:
{
  "categories": [
    {
      "key": "category_key",
      "label": "Category Label",
      "items": ["Bullet point 1", "Bullet point 2", ...]
    }
  ]
}

IMPORTANT:
- Include ALL categories in your response, even if empty (use empty items array)
- Each item should be a complete bullet point (no bullet character, just text)
- Order categories exactly as specified above
- Focus on high-impact, actionable items for leadership
- If multiple entries describe similar work, combine them into a single powerful bullet
- Do NOT include any text outside the JSON object

Generate the WAR now:`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body: GenerateWARRequest = await request.json();
    const {
      entries,
      categories,
      weekStart,
      weekEnd,
      unitOfficeSymbol,
      synthesisInstructions,
      preparedBy,
      model,
    } = body;

    // Validate required fields
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: "No entries provided" },
        { status: 400 }
      );
    }

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { error: "No categories provided" },
        { status: 400 }
      );
    }

    // Get user's API keys
    const userKeys = await getDecryptedApiKeys();

    // Get the model provider
    const modelId = model || DEFAULT_MODEL;
    const modelProvider = getModelProvider(modelId, userKeys);

    // Build the prompt
    const prompt = buildWARPrompt(entries, categories, synthesisInstructions);

    // Generate the WAR
    const { text } = await generateText({
      model: modelProvider,
      prompt,
      temperature: 0.3, // Lower temperature for more consistent output
      maxTokens: 2000,
    });

    // Parse the JSON response
    let parsedResponse: { categories: { key: string; label: string; items: string[] }[] };
    
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Error parsing WAR response:", parseError, "\nRaw text:", text);
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    // Validate the response structure
    if (!parsedResponse.categories || !Array.isArray(parsedResponse.categories)) {
      return NextResponse.json(
        { error: "Invalid response structure from AI" },
        { status: 500 }
      );
    }

    // Format the date range
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    const dateRange = `${startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;

    // Build the final report
    const report: WARReport = {
      header: {
        date_range: dateRange,
        unit_office_symbol: unitOfficeSymbol,
        prepared_by: preparedBy,
      },
      categories: parsedResponse.categories.map((c) => ({
        key: c.key,
        label: c.label,
        items: c.items || [],
      })),
    };

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Error generating WAR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
