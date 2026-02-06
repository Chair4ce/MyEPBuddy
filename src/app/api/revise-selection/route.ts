import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { 
  getUserStyleContext, 
  buildStyleGuidance, 
  buildFewShotExamples,
  triggerStyleProcessing 
} from "@/lib/style-learning";
import {
  buildCharacterEmphasisPrompt,
} from "@/lib/character-verification";
import {
  performQualityControl,
  shouldRunQualityControl,
  type QualityControlConfig,
} from "@/lib/quality-control";
import type { StyleExampleCategory } from "@/types/database";

// Allow up to 60s for LLM calls (initial generation + quality control pass)
export const maxDuration = 60;

interface ReviseSelectionRequest {
  fullStatement: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  model: string;
  mode?: "expand" | "compress" | "general"; // expand = longer words, compress = shorter words
  context?: string; // Additional context for revision
  usedVerbs?: string[]; // Verbs already used in this cycle - avoid repeating
  aggressiveness?: number; // 0-100: how aggressively to replace words (0 = minimal, 100 = replace almost all)
  fillToMax?: boolean; // If true, prioritize filling to max character count
  maxCharacters?: number; // Max character limit for the statement
  versionCount?: number; // Number of revisions to generate (default 3)
  category?: StyleExampleCategory; // MPA category for style learning
}

// Overused/cliché verbs that should be avoided unless user explicitly requests them
const BANNED_VERBS = [
  "spearheaded",
  "orchestrated", 
  "synergized",
  "leveraged",
  "impacted",
  "utilized",
  "facilitated",
];

// Strong action verbs to encourage variety
const RECOMMENDED_VERBS = [
  "led", "directed", "managed", "executed", "drove", "commanded", "guided",
  "pioneered", "championed", "transformed", "revolutionized", "modernized",
  "accelerated", "streamlined", "optimized", "enhanced", "elevated", "strengthened",
  "secured", "safeguarded", "protected", "defended", "fortified", "hardened",
  "trained", "mentored", "developed", "coached", "cultivated", "empowered",
  "resolved", "eliminated", "eradicated", "mitigated", "prevented", "reduced",
  "delivered", "produced", "generated", "created", "built", "established",
  "coordinated", "synchronized", "integrated", "unified", "consolidated",
  "analyzed", "assessed", "evaluated", "identified", "diagnosed", "investigated",
  "negotiated", "secured", "acquired", "procured", "saved", "recovered",
];

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
    const { 
      fullStatement, 
      selectedText, 
      selectionStart, 
      selectionEnd, 
      model, 
      mode = "general", 
      context, 
      usedVerbs = [],
      aggressiveness = 50,
      fillToMax = true,
      maxCharacters,
      versionCount = 3,
      category,
    } = body;
    
    // Fetch user style context for personalization (non-blocking if fails)
    const styleContext = await getUserStyleContext(user.id, category);
    
    // Combine banned verbs with already-used verbs for this session
    const verbsToAvoid = [...new Set([...BANNED_VERBS, ...usedVerbs.map(v => v.toLowerCase())])];
    
    // Calculate aggressiveness instructions
    const getAggressivenessInstructions = (level: number): string => {
      if (level <= 20) {
        return `**WORD REPLACEMENT LEVEL: MINIMAL (${level}%)**
- Make VERY FEW changes - only fix obvious issues
- Keep the overall structure and most words intact
- Only replace words that are clearly weak or redundant
- Preserve the author's voice and style as much as possible
- Focus on 1-2 small improvements per version`;
      } else if (level <= 40) {
        return `**WORD REPLACEMENT LEVEL: CONSERVATIVE (${level}%)**
- Make LIMITED changes - keep most of the original phrasing
- Replace only the weakest words and phrases
- Maintain the general sentence structure
- Focus on enhancing key action verbs and impact phrases
- Preserve numerical data and metrics exactly as-is`;
      } else if (level <= 60) {
        return `**WORD REPLACEMENT LEVEL: MODERATE (${level}%)**
- Make BALANCED changes - refresh phrasing while keeping core meaning
- Replace verbs and descriptive words freely
- Restructure phrases for better flow
- Keep the same factual content and metrics
- Aim for noticeable improvement without complete rewrite`;
      } else if (level <= 80) {
        return `**WORD REPLACEMENT LEVEL: AGGRESSIVE (${level}%)**
- Make SIGNIFICANT changes - substantially rewrite for impact
- Replace most words except core metrics and data
- Feel free to restructure sentences completely
- Use fresh vocabulary and phrasing throughout
- Only preserve specific numbers, percentages, and proper nouns`;
      } else {
        return `**WORD REPLACEMENT LEVEL: MAXIMUM (${level}%)**
- COMPLETELY REWRITE the text with fresh perspective
- Replace virtually all words except metrics and data
- Use entirely new sentence structure and approach
- Only preserve: numbers, percentages, dollar amounts, proper nouns
- Create a completely fresh take while maintaining factual accuracy`;
      }
    };
    
    // Calculate fill-to-max instructions with enhanced emphasis
    const getFillInstructions = (shouldFill: boolean, maxChars?: number, currentLength?: number): string => {
      if (!shouldFill || !maxChars) {
        return "";
      }
      const targetMin = maxChars - 10;
      const charsToAdd = maxChars - (currentLength || 0);
      
      // Use the enhanced character emphasis prompt
      const emphasisPrompt = buildCharacterEmphasisPrompt(targetMin, maxChars, charsToAdd > 0 ? "expand" : "compress");
      
      return `
${emphasisPrompt}

**CURRENT STATUS:**
- Input: ${currentLength || "unknown"} characters
- Target: ${targetMin}-${maxChars} characters
- Action needed: ${charsToAdd > 0 ? `ADD ${charsToAdd} characters` : charsToAdd < 0 ? `REMOVE ${Math.abs(charsToAdd)} characters` : "Minor adjustment"}

**⚠️ CRITICAL VERIFICATION PROCESS (MANDATORY FOR EACH REVISION) ⚠️**

You MUST execute this EXACT sequence for each revision:

STEP 1: Draft your revision

STEP 2: COUNT characters using this mental model:
- Count every letter, number, space, and punctuation mark
- Example: "Led 4-mbr tm" = 12 characters (L-e-d-space-4---m-b-r-space-t-m)

STEP 3: Calculate compliance:
- Is your count between ${targetMin} and ${maxChars}? 
- If YES: ✓ COMPLIANT - include this revision
- If NO: ❌ NOT COMPLIANT - proceed to STEP 4

STEP 4: If NOT COMPLIANT:
- If UNDER ${targetMin}: Expand words, add scope, add adjectives
- If OVER ${maxChars}: Use abbreviations, remove weak words, condense
- REPEAT from STEP 2 until compliant

STEP 5: Only output revisions that are ${targetMin}-${maxChars} characters

**FAILURE TO COMPLY = REVISION REJECTED**`;
    };

    if (!fullStatement || !selectedText) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    const modelProvider = getModelProvider(model, userKeys);

    const beforeSelection = fullStatement.substring(0, selectionStart);
    const afterSelection = fullStatement.substring(selectionEnd);

    // Build mode-specific instructions
    const modeInstructions = {
      expand: `**MODE: EXPAND (use longer words to fill more space)**
Your goal is to make the selected text LONGER by:
- Using longer, more descriptive words (e.g., "led" → "directed", "cut" → "eliminated", "made" → "established")
- Adding impactful adjectives and adverbs where natural
- Expanding any abbreviations to full words
- Using more elaborate phrasing while maintaining meaning
- Target length: ${Math.round(selectedText.length * 1.2)}-${Math.round(selectedText.length * 1.4)} characters (20-40% longer)`,
      
      compress: `**MODE: COMPRESS (use shorter words to save space)**
Your goal is to make the selected text SHORTER by:
- Using shorter, punchier words (e.g., "orchestrated" → "led", "established" → "built", "eliminated" → "cut", "approximately" → "~")
- Removing unnecessary filler words while keeping meaning
- Using more concise phrasing
- Combining phrases where possible
- Target length: ${Math.round(selectedText.length * 0.65)}-${Math.round(selectedText.length * 0.85)} characters (15-35% shorter)`,
      
      general: `**MODE: IMPROVE (completely rewrite with fresh perspective)**
Your goal is to SIGNIFICANTLY transform the selected text:
- Use a COMPLETELY DIFFERENT opening verb - do not keep the same structure
- Reframe the accomplishment from a new angle
- Improve quantification and impact
- Each of your 3 alternatives should use DIFFERENT verbs from each other
- Target length: ~${selectedText.length} characters (within 20% of original)`,
    };
    
    // Get available verbs (exclude used ones)
    const availableVerbs = RECOMMENDED_VERBS.filter(v => !verbsToAvoid.includes(v.toLowerCase()));

    const aggressivenessInstructions = getAggressivenessInstructions(aggressiveness);
    const fillInstructions = getFillInstructions(fillToMax, maxCharacters, selectedText.length);

    // Build style guidance from user's learned preferences
    const styleGuidance = buildStyleGuidance(styleContext);
    const fewShotExamples = buildFewShotExamples(styleContext, "USER'S APPROVED STATEMENTS (match this style)");

    const systemPrompt = `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

Your task is to revise the selected portion of text while maintaining coherence with the surrounding context.

${modeInstructions[mode]}

${aggressivenessInstructions}
${fillInstructions}

${styleGuidance}

${fewShotExamples}

**BANNED VERBS - NEVER USE THESE (overused clichés):**
${verbsToAvoid.map(v => `- "${v}"`).join("\n")}

**RECOMMENDED STRONG VERBS (use these instead):**
${availableVerbs.slice(0, 20).join(", ")}

**FORBIDDEN PUNCTUATION (DO NOT USE UNDER ANY CIRCUMSTANCES):**
- Em-dashes: -- (ABSOLUTELY NEVER use these)
- Semicolons: ;
- Slashes: /

**USE ONLY:** Commas (,) to connect clauses

**PRESERVE THESE EXACTLY (never change):**
- All numbers and metrics (e.g., "36", "24/7", "$14B", "909K", "1.2M")
- Percentages (e.g., "99%", "15%")
- Dollar amounts (e.g., "$5M", "$14B")
- Abbreviations for units (e.g., "Amn", "hrs", "TB")
- Acronyms (e.g., "O&M", "AFCYBER", "USCYBERCOM")
- Proper nouns and organizational names

CRITICAL RULES:
1. NEVER use any verb from the BANNED list - these are overused Air Force clichés
2. Each of your ${versionCount} alternatives MUST use DIFFERENT opening verbs from each other
3. Output ONLY the revised text for the selected portion - no quotes, no explanation
4. Maintain the same general meaning but with appropriately varied phrasing based on aggressiveness level
5. Maintain grammatical coherence with surrounding text
6. NEVER use em-dashes (--) - use COMMAS instead to connect clauses
7. If the selection starts at the beginning of the statement and includes "- ", preserve the "- " prefix
8. READABILITY: Revised text should flow naturally when read aloud
9. PARALLELISM: Use consistent verb tense throughout (all past tense OR all present participles)
10. AVOID creating run-on laundry lists of 5+ actions - keep it focused
11. AVOID the word "the" - it wastes characters (e.g., "led the team" → "led 4-mbr team" - always quantify scope)
12. CONSISTENCY: Use either "&" OR "and" throughout - NEVER mix them. Prefer "&" when saving space.`;

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
AGGRESSIVENESS: ${aggressiveness}% (${aggressiveness <= 20 ? "minimal changes" : aggressiveness <= 40 ? "conservative" : aggressiveness <= 60 ? "moderate" : aggressiveness <= 80 ? "aggressive" : "maximum rewrite"})
${fillToMax && maxCharacters ? `
⚠️ CHARACTER TARGET: ${maxCharacters - 10}-${maxCharacters} chars (add ~${maxCharacters - selectedText.length > 0 ? maxCharacters - selectedText.length : 0} chars)
` : ""}

Generate ${versionCount} revisions of ONLY the selected portion.${fillToMax && maxCharacters ? ` Each MUST be ${maxCharacters - 10}-${maxCharacters} chars.` : ""}

Return JSON array only: [${Array.from({ length: versionCount }, (_, i) => `"revision${i + 1}"`).join(", ")}]`;

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
      revisions = text.split("\n").filter(line => line.trim().length > 10).slice(0, versionCount);
    }

    // Ensure we have at least one revision and limit to requested count
    if (revisions.length === 0) {
      revisions = [selectedText]; // Return original if nothing generated
    } else {
      revisions = revisions.slice(0, versionCount);
    }

    // POST-GENERATION QUALITY CONTROL
    // Single consolidated QC pass that handles:
    // - Character count enforcement (when fillToMax is enabled)
    // - Statement diversity check
    // - Instruction compliance verification
    // This is ONE LLM call instead of multiple per-statement calls
    if (fillToMax && maxCharacters) {
      const targetMin = maxCharacters - 10;
      
      // Check if QC is worth running
      const qcCheck = shouldRunQualityControl(revisions, fillToMax, maxCharacters, targetMin);
      
      if (qcCheck.shouldRun) {
        try {
          const qcConfig: QualityControlConfig = {
            statements: revisions,
            userPrompt: systemPrompt, // The prompt used for revision
            targetMaxChars: maxCharacters,
            targetMinChars: targetMin,
            fillToMax,
            context: category || "EPB statement revision",
            model: modelProvider as LanguageModel,
          };
          
          const qcResult = await performQualityControl(qcConfig);
          
          revisions = qcResult.statements;
          
          // Log QC results
          console.log(
            `[Revise] QC: adjusted=${qcResult.wasAdjusted}, ` +
            `diversity=${qcResult.evaluation.diversityScore}, ` +
            `compliance=${qcResult.evaluation.instructionCompliance}, ` +
            `charLimits=${qcResult.evaluation.allMeetCharacterLimits}, ` +
            `reason=${qcResult.stopReason}`
          );
        } catch (qcError) {
          console.error("[Revise] QC failed:", qcError);
          // Fall back to original revisions (already set)
        }
      } else {
        console.log(`[Revise] Skipping QC: ${qcCheck.reason}`);
      }
    }

    // Trigger async style processing (fire-and-forget)
    triggerStyleProcessing(user.id);

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

