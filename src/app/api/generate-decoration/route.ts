import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { buildDecorationSystemPrompt, expandAbbreviations } from "@/lib/decoration-prompts";
import type { DecorationAwardType, DecorationReason } from "@/lib/decoration-constants";
import { DECORATION_TYPES } from "@/lib/decoration-constants";

interface GenerateDecorationRequest {
  // Ratee info
  rateeId: string;
  rateeRank: string;
  rateeName: string;
  rateeGender?: "male" | "female";
  
  // Position info
  dutyTitle: string;
  unit: string;
  startDate: string;
  endDate: string;
  
  // Award info
  awardType: DecorationAwardType;
  reason: DecorationReason;
  fontSize: 10 | 12;
  
  // Content
  accomplishments: string[];
  
  // AI config
  model: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body: GenerateDecorationRequest = await request.json();
    
    // Validate required fields
    if (!body.rateeRank || !body.rateeName || !body.awardType || !body.accomplishments?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Get decoration config
    const decorationConfig = DECORATION_TYPES.find(d => d.key === body.awardType);
    if (!decorationConfig) {
      return NextResponse.json(
        { error: "Invalid award type" },
        { status: 400 }
      );
    }
    
    // Get API keys
    const apiKeys = await getDecryptedApiKeys();
    
    // Select model provider
    const modelProvider = getModelProvider(body.model, apiKeys || {});
    if (!modelProvider) {
      return NextResponse.json(
        { error: "No API key available for selected model" },
        { status: 400 }
      );
    }
    
    // Build system prompt
    const systemPrompt = buildDecorationSystemPrompt({
      awardType: body.awardType,
      reason: body.reason || "meritorious_service",
      rank: body.rateeRank,
      fullName: body.rateeName,
      dutyTitle: body.dutyTitle || "member",
      unit: body.unit || "the organization",
      startDate: body.startDate || "start date",
      endDate: body.endDate || "end date",
      accomplishments: body.accomplishments,
      fontSize: body.fontSize || 12,
      gender: body.rateeGender,
    });
    
    // Generate citation
    const { text: rawCitation } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: "Generate the complete decoration citation based on the provided information and accomplishments.",
      temperature: 0.7,
      maxTokens: 2000,
    });
    
    // Post-process to expand any remaining abbreviations
    const citation = expandAbbreviations(rawCitation);
    
    // Count lines (approximate - assume ~80 chars per line at 12pt)
    const charsPerLine = body.fontSize === 12 ? 80 : 100;
    const estimatedLines = Math.ceil(citation.length / charsPerLine);
    const maxLines = body.fontSize === 12 ? decorationConfig.maxLines12pt : decorationConfig.maxLines10pt;
    
    return NextResponse.json({
      citation,
      metadata: {
        awardType: body.awardType,
        awardName: decorationConfig.name,
        estimatedLines,
        maxLines,
        fontSize: body.fontSize,
        withinLimit: estimatedLines <= maxLines,
        model: body.model,
      },
    });
    
  } catch (error) {
    console.error("Generate decoration error:", error);
    return NextResponse.json(
      { error: "Failed to generate citation" },
      { status: 500 }
    );
  }
}

function getModelProvider(
  model: string,
  apiKeys: { openai_key?: string | null; anthropic_key?: string | null; google_key?: string | null; grok_key?: string | null }
): LanguageModel | null {
  // Check user keys first, then fall back to env keys
  const openaiKey = apiKeys.openai_key || process.env.OPENAI_API_KEY;
  const anthropicKey = apiKeys.anthropic_key || process.env.ANTHROPIC_API_KEY;
  const googleKey = apiKeys.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const xaiKey = apiKeys.grok_key || process.env.XAI_API_KEY;
  
  if (model.startsWith("gpt-") && openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(model);
  }
  
  if (model.startsWith("claude-") && anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic(model);
  }
  
  if (model.startsWith("gemini-") && googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return google(model);
  }
  
  if (model.startsWith("grok-") && xaiKey) {
    const xai = createXai({ apiKey: xaiKey });
    return xai(model);
  }
  
  // Default fallback - try each provider in order
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic("claude-sonnet-4-20250514");
  }
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai("gpt-4o");
  }
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return google("gemini-2.0-flash");
  }
  if (xaiKey) {
    const xai = createXai({ apiKey: xaiKey });
    return xai("grok-2");
  }
  
  return null;
}
