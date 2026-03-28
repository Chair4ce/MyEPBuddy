import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded, handleBurstRateLimited } from "@/lib/llm-error-handler";
import { buildDecorationSystemPrompt, expandAbbreviations } from "@/lib/decoration-prompts";
import type { DecorationAwardType, DecorationReason } from "@/lib/decoration-constants";
import { DECORATION_TYPES } from "@/lib/decoration-constants";
import type { UserLLMSettings } from "@/types/database";
import { scanTextForLLM } from "@/lib/sensitive-data-scanner";
import { checkAndTrackUsage } from "@/lib/usage-tracker";

/** Format "2025-02-26" → "26 February 2025" for citation display */
function formatCitationDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const parsed = new Date(dateStr + "T00:00:00");
  if (isNaN(parsed.getTime())) return dateStr;
  const day = parsed.getDate();
  const month = parsed.toLocaleString("en-US", { month: "long" });
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface GenerateDecorationRequest {
  // Ratee info
  rateeId: string;
  rateeRank: string;
  rateeName: string;
  rateeGender?: "male" | "female";
  
  // Position / assignment info (structured)
  dutyTitle: string;
  office: string;
  squadron: string;
  groupName: string;  // optional
  wing: string;       // optional
  baseName: string;
  location: string;   // state or country
  startDate: string;
  endDate: string;
  
  // Award info
  awardType: DecorationAwardType;
  reason: DecorationReason;
  /** @deprecated MyDecs Reimagined uses character limits, not line limits */
  fontSize?: 10 | 12;
  
  // Content
  accomplishments: string[];
  
  // AI config
  model: string;
}

/**
 * Build the comma-separated assignment chain from structured fields.
 * Example output: "42 CS/SCOO, 67th Fighter Squadron, 18th Operations Group,
 *                  480 ISR Wing, Kadena Air Base, Japan"
 * Group and Wing are optional — omitted when empty.
 */
function buildAssignmentLine(body: GenerateDecorationRequest): string {
  const parts: string[] = [];

  if (body.office?.trim()) parts.push(body.office.trim());
  if (body.squadron?.trim()) parts.push(body.squadron.trim());
  // Group and Wing are optional
  if (body.groupName?.trim()) parts.push(body.groupName.trim());
  if (body.wing?.trim()) parts.push(body.wing.trim());
  if (body.baseName?.trim()) parts.push(body.baseName.trim());
  if (body.location?.trim()) parts.push(body.location.trim());

  return parts.length > 0 ? parts.join(", ") : "the organization";
}

export async function POST(request: Request) {
  let modelId: string | undefined;
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

    // Scan accomplishment text for PII/CUI/classification markings before sending to LLM
    for (const accomplishment of body.accomplishments) {
      const { blocked, matches } = scanTextForLLM(accomplishment);
      if (blocked) {
        const types = [...new Set(matches.map((m) => m.label))].join(", ");
        return NextResponse.json(
          { error: `Sensitive data detected (${types}). Please remove before generating.` },
          { status: 400 }
        );
      }
    }
    
    // Get decoration config
    const decorationConfig = DECORATION_TYPES.find(d => d.key === body.awardType);
    if (!decorationConfig) {
      return NextResponse.json(
        { error: "Invalid award type" },
        { status: 400 }
      );
    }
    
    // Get API keys and select model provider
    const apiKeys = await getDecryptedApiKeys();
    modelId = body.model;

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(user.id, "generate_decoration", modelId, apiKeys);
    if (!usageCheck.allowed) {
      return usageCheck.rateLimited
        ? handleBurstRateLimited()
        : handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const modelProvider = getModelProvider(effectiveModel, apiKeys);
    
    // Load user LLM settings for custom decoration prompt, rank verbs, and abbreviations
    const { data: settingsData } = await supabase
      .from("user_llm_settings")
      .select("decoration_system_prompt, decoration_style_guidelines, decoration_abbreviations, rank_verb_progression")
      .eq("user_id", user.id)
      .maybeSingle();
    
    const userSettings = settingsData as unknown as Partial<UserLLMSettings> | null;

    // Build the approved abbreviations list (if user has defined any)
    const decorationAbbrevs = (userSettings?.decoration_abbreviations || []) as Array<{ word: string; abbreviation: string }>;
    const abbreviationsText = decorationAbbrevs.length > 0
      ? decorationAbbrevs.map(a => `"${a.word}" → "${a.abbreviation}"`).join(", ")
      : "";
    
    // Build system prompt - use user's custom decoration prompt if available
    let systemPrompt: string;
    
    if (userSettings?.decoration_system_prompt) {
      // User has a custom decoration prompt - apply placeholder replacements
      const rankVerbs = userSettings.rank_verb_progression?.[body.rateeRank as keyof typeof userSettings.rank_verb_progression] || {
        primary: ["Led", "Managed"],
        secondary: ["Executed", "Coordinated"],
      };
      const rankVerbGuidance = `Primary verbs: ${rankVerbs.primary.join(", ")}\n  Secondary verbs: ${rankVerbs.secondary.join(", ")}`;
      
      let prompt = userSettings.decoration_system_prompt;
      prompt = prompt.replace(/\{\{ratee_rank\}\}/g, body.rateeRank);
      prompt = prompt.replace(/\{\{primary_verbs\}\}/g, rankVerbs.primary.join(", "));
      prompt = prompt.replace(/\{\{rank_verb_guidance\}\}/g, rankVerbGuidance);
      prompt = prompt.replace(
        /\{\{decoration_abbreviations_list\}\}/g,
        abbreviationsText || "None — spell out all abbreviations and acronyms."
      );
      
      // Append style guidelines if available
      if (userSettings.decoration_style_guidelines) {
        prompt += `\n\nADDITIONAL STYLE GUIDANCE:\n${userSettings.decoration_style_guidelines}`;
      }
      
      // Append the structured citation details (opening template, accomplishments, etc.)
      // The user prompt handles ratee info, accomplishments, and closing template
      systemPrompt = prompt;
    } else {
      // Use default hardcoded decoration prompt builder
      systemPrompt = buildDecorationSystemPrompt({
        awardType: body.awardType,
        reason: body.reason || "meritorious_service",
        rank: body.rateeRank,
        fullName: body.rateeName,
        dutyTitle: body.dutyTitle || "member",
        assignmentLine: buildAssignmentLine(body),
        startDate: body.startDate || "start date",
        endDate: body.endDate || "end date",
        accomplishments: body.accomplishments,
        gender: body.rateeGender,
        maxCharacters: decorationConfig.maxCharacters,
        approvedAbbreviations: abbreviationsText,
      });
    }
    
    // Build user prompt with ratee details and accomplishments
    const assignmentLine = buildAssignmentLine(body);
    const userPrompt = userSettings?.decoration_system_prompt
      ? `Generate a ${decorationConfig.name} (${decorationConfig.abbreviation}) citation.

## RATEE INFORMATION
- Rank: ${body.rateeRank}
- Full Name: ${body.rateeName}
- Duty Title: ${body.dutyTitle || "member"}
- Assignment: ${assignmentLine}
- Period: ${formatCitationDate(body.startDate) || "start date"} to ${formatCitationDate(body.endDate) || "end date"}
- Award Reason: ${body.reason || "meritorious_service"}
- Maximum Characters: ${decorationConfig.maxCharacters}

## ACCOMPLISHMENTS TO INCORPORATE
${body.accomplishments.map((a, i) => `${i + 1}. ${a}`).join("\n")}

HARD LIMIT: The entire citation MUST be ≤ ${decorationConfig.maxCharacters} characters (including spaces). FORMAT: Output the citation as ONE continuous paragraph — NO line breaks or newlines anywhere. Use numerals for numbers 10+ (23, 350, 1.4K). Do NOT spell out large numbers. Do NOT add filler phrases like "During this period" or "In this important assignment." Go directly into accomplishments after the opening sentence. The opening sentence MUST use the assignment chain exactly as provided (e.g., "...as ${body.dutyTitle || "member"}, ${assignmentLine}..."). Output ONLY the citation as a single paragraph, ready to paste directly onto ${decorationConfig.afForm}.`
      : "Generate the complete decoration citation based on the provided information and accomplishments.";

    // Generate citation
    const { text: rawCitation } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
      maxTokens: 1200,
    });
    
    // Post-process: strip line breaks (citation must be a single paragraph) and expand abbreviations
    const singleParagraph = rawCitation
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const citation = expandAbbreviations(singleParagraph);
    
    // Character count check (MyDecs Reimagined uses 1350 char limit)
    const characterCount = citation.length;
    const maxCharacters = decorationConfig.maxCharacters;
    
    // Also calculate legacy line estimate for reference
    const estimatedLines = Math.ceil(characterCount / 80);
    
    return NextResponse.json({
      citation,
      metadata: {
        awardType: body.awardType,
        awardName: decorationConfig.name,
        characterCount,
        maxCharacters,
        withinLimit: characterCount <= maxCharacters,
        estimatedLines, // Legacy reference
        model: body.model,
      },
    });
    
  } catch (error) {
    return handleLLMError(error, "POST /api/generate-decoration", modelId);
  }
}
