import { createClient } from "@/lib/supabase/server";
import { generateText, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError } from "@/lib/llm-error-handler";
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
import type { StyleExampleCategory, WritingStyle } from "@/types/database";
import { getChainStyleSignature, getUserStyleSignature, buildSignaturePromptSection } from "@/lib/style-signatures";

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
  isDutyDescription?: boolean; // If true, use duty-description-specific prompt (scope/responsibility, not performance)
  writingStyle?: WritingStyle; // Writing style preference for style signature injection
  rateeRank?: string; // Rank of the ratee (for style signature lookup)
  rateeAfsc?: string; // AFSC of the ratee (for style signature lookup)
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

/**
 * Build system prompt for DUTY DESCRIPTION revisions.
 * Duty descriptions describe the member's scope of responsibility and role in present tense.
 * They are NOT performance statements - no past-tense action verbs, no subjective adjectives,
 * no accomplishment results, no "how well" language.
 */
function buildDutyDescriptionPrompt(
  mode: "expand" | "compress" | "general",
  modeInstructions: Record<string, string>,
  aggressivenessInstructions: string,
  fillInstructions: string,
  styleGuidance: string,
  fewShotExamples: string,
  versionCount: number,
  userCustomPrompt?: string | null,
): string {
  // Override mode instructions for duty descriptions
  const dutyModeOverride: Record<string, string> = {
    expand: `**MODE: EXPAND (use longer words to fill more space)**
Your goal is to make the selected text LONGER by:
- Using longer, more descriptive words for the role and scope
- Adding specific organizational details, team sizes, or mission scope
- Expanding abbreviations to full words where space allows
- Adding positional framing (e.g., "As a [role]" or "Serving as [position]")
- KEEP PRESENT TENSE - this describes a current role, not a past accomplishment`,
    compress: `**MODE: COMPRESS (use shorter words to save space)**
Your goal is to make the selected text SHORTER by:
- Using shorter, concise words to describe the role and scope
- Abbreviating where standard AF abbreviations exist (e.g., "member" → "mbr", "team" → "tm")
- Combining descriptive phrases where possible
- Removing redundant positional language
- KEEP PRESENT TENSE - this describes a current role, not a past accomplishment`,
    general: `**MODE: IMPROVE (rewrite with fresh perspective)**
Your goal is to improve the duty description by:
- Using a different opening structure or framing
- Varying how the scope and responsibility are described
- Each of your ${versionCount} alternatives should approach the role description from a different angle
- KEEP PRESENT TENSE - this describes a current role, not a past accomplishment
- Target length: ~similar to original (within 20%)`,
  };

  // Use user's custom prompt if available, otherwise use default
  const basePrompt = userCustomPrompt || `You are an expert Air Force writer helping to revise a DUTY DESCRIPTION for an EPB (Enlisted Performance Brief).

**⚠️ THIS IS A DUTY DESCRIPTION - NOT A PERFORMANCE STATEMENT ⚠️**

A duty description describes the member's CURRENT ROLE, SCOPE, and RESPONSIBILITIES.
It is purely factual and descriptive - it states WHAT the member's job encompasses, NOT how well they perform.

**DUTY DESCRIPTION WRITING RULES:**
1. USE PRESENT TENSE - describes a current, ongoing role (e.g., "drives", "supports", "coordinates", "manages")
2. NEVER use past tense performance verbs (e.g., "led", "directed", "ensured", "bolstered", "enhanced")
3. NEVER use subjective performance adjectives (e.g., "expertly", "skillfully", "effectively", "proficiently")
4. NEVER add accomplishment results or impact language (e.g., "ensured seamless integration", "bolstered command capabilities")
5. Describe SCOPE and RESPONSIBILITY - team size, mission area, organizations supported, programs owned
6. Use descriptive framing like "As a [role]", "Serving as [position]", or direct present-tense descriptions
7. Do NOT invent new facts or add scope that isn't in the original - only rephrase existing content

**GOOD DUTY DESCRIPTION VERBS (present tense, descriptive):**
drives, supports, coordinates, manages, oversees, advises, maintains, provides, enables, serves as, operates, sustains, 
ensures (only for describing an ongoing responsibility), administers, represents, liaises, synchronizes, integrates, 
conducts, facilitates (for coordination, not accomplishments), monitors, evaluates, governs, directs (present tense only)

**BAD - NEVER USE THESE IN DUTY DESCRIPTIONS:**
- Past-tense performance verbs: led, directed, managed, executed, ensured (past), bolstered, enhanced, strengthened, championed, pioneered
- Subjective adjectives: expertly, skillfully, proficiently, adeptly, effectively, seamlessly
- Accomplishment/result language: "resulting in", "enabling X% improvement", "saving $X", "bolstering capabilities"
- Cliché openers: "Charged as", "Selected as", "Piloted" (these imply performance, not scope)

**EXAMPLE - CORRECT DUTY DESCRIPTION STYLE:**
"As a crew operations subject matter expert, he drives a 3-member cyber event coordination team during a numbered AF transition, supporting the elevation of AFSOUTH to a Service Component Command and establishing AFSOUTH's first ever MAJCOM Cyber Coordination Center."

**EXAMPLE - WRONG (performance language, past tense):**
"Charged as crew ops SME, he expertly led a 3-mbr cyber event coordination team during a Numbered AF transition, enabling AFSOUTH's elevation to a Service Component Command & standing up AFSOUTH's initial MAJCOM Cyber Coordination Center. His guidance ensured seamless integration & enhanced cyber readiness."`;

  return `${basePrompt}

${dutyModeOverride[mode]}

${aggressivenessInstructions}
${fillInstructions}

${styleGuidance}

${fewShotExamples}

**FORBIDDEN PUNCTUATION (DO NOT USE UNDER ANY CIRCUMSTANCES):**
- Em-dashes: -- (ABSOLUTELY NEVER use these)
- Semicolons: ;

**USE ONLY:** Commas (,) and "and"/"&" to connect clauses

**PRESERVE THESE EXACTLY (never change):**
- All numbers and metrics (e.g., "36", "3-member", "$14B", "909K")
- Acronyms (e.g., "AFSOUTH", "MAJCOM", "AF")
- Proper nouns and organizational names
- Team sizes and specific scope details

CRITICAL RULES:
1. PRESENT TENSE ONLY - "drives", "supports", "coordinates" - NOT "led", "drove", "supported"
2. NO performance adjectives - NO "expertly", "skillfully", "seamlessly"
3. NO accomplishment results or impact beyond describing the role's scope
4. Each of your ${versionCount} alternatives MUST use DIFFERENT opening structures
5. Output ONLY the revised text - no quotes, no explanation
6. Maintain grammatical coherence with surrounding text
7. NEVER use em-dashes (--) - use COMMAS instead
8. KEEP factual content identical - only rephrase, do not invent new scope or responsibilities
9. Prefer "&" over "and" when saving space
10. AVOID the word "the" where possible - it wastes characters`;
}

/**
 * Build system prompt for MPA STATEMENT revisions (performance/accomplishment statements).
 * These use past-tense action verbs and describe the member's accomplishments and impact.
 */
function buildStatementPrompt(
  mode: "expand" | "compress" | "general",
  modeInstructions: Record<string, string>,
  aggressivenessInstructions: string,
  fillInstructions: string,
  styleGuidance: string,
  fewShotExamples: string,
  verbsToAvoid: string[],
  availableVerbs: string[],
  versionCount: number,
): string {
  return `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

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

**BANNED FILLER CLOSERS (NEVER USE - these sound impressive but say nothing specific):**
- "ensuring mission success" / "ensuring mission readiness"
- "bolstering global ops" / "bolstering global operations"
- "vital to force projection"
- "critical to national defense"
- "enhancing combat capability"
- "supporting warfighter needs"
- "key to operational excellence"
- Any generic closer that could apply to ANY accomplishment. The ending must be SPECIFIC to THIS accomplishment's actual impact.

BAD ENDING: "...saving $50K, ensuring mission success." (generic - what mission? how?)
GOOD ENDING: "...saving $50K annually, sustaining network access for 58K users." (specific, measurable)

CRITICAL RULES:
1. NEVER use any verb from the BANNED list - these are overused Air Force clichés
2. NEVER end with generic filler closers from the BANNED FILLER list - endings must reference SPECIFIC impacts
3. Each of your ${versionCount} alternatives MUST use DIFFERENT opening verbs from each other
4. Output ONLY the revised text for the selected portion - no quotes, no explanation
5. Maintain the same general meaning but with appropriately varied phrasing based on aggressiveness level
6. Maintain grammatical coherence with surrounding text
7. NEVER use em-dashes (--) - use COMMAS instead to connect clauses
8. If the selection starts at the beginning of the statement and includes "- ", preserve the "- " prefix
9. READABILITY: Revised text should flow naturally when read aloud
10. PARALLELISM: Use consistent verb tense throughout (all past tense OR all present participles)
11. AVOID creating run-on laundry lists of 5+ actions - keep it focused
12. AVOID the word "the" - it wastes characters (e.g., "led the team" → "led 4-mbr team" - always quantify scope)
13. CONSISTENCY: Use either "&" OR "and" throughout - NEVER mix them. Prefer "&" when saving space.`;
}

export async function POST(request: Request) {
  let requestModelId: string | undefined;
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
      isDutyDescription = false,
      writingStyle,
      rateeRank,
      rateeAfsc,
    } = body;
    
    // Load user's custom duty description prompt if this is a duty description revision
    let userDutyDescriptionPrompt: string | null = null;
    if (isDutyDescription) {
      const { data: settingsData } = await supabase
        .from("user_llm_settings")
        .select("duty_description_prompt")
        .eq("user_id", user.id)
        .maybeSingle();
      userDutyDescriptionPrompt = (settingsData as { duty_description_prompt: string | null } | null)?.duty_description_prompt || null;
    }

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

    requestModelId = model;
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

    // Load style signature for chain_of_command or personal style (non-duty-description only)
    let styleSignatureSection = "";
    if (!isDutyDescription && rateeRank && rateeAfsc) {
      const effectiveStyle = writingStyle || "personal";
      if (effectiveStyle === "chain_of_command") {
        try {
          const chainResult = await getChainStyleSignature(
            user.id,
            rateeRank,
            rateeAfsc,
            category || "general"
          );
          if (chainResult.signature) {
            styleSignatureSection = buildSignaturePromptSection(
              chainResult.signature.signature_text,
              chainResult.sourceRank,
              chainResult.fallbackUsed
            );
          }
        } catch (err) {
          console.error("[revise-selection] Chain style signature error:", err);
        }
      } else if (effectiveStyle === "personal") {
        try {
          const personalSig = await getUserStyleSignature(
            user.id,
            rateeRank,
            rateeAfsc,
            category || "general"
          );
          if (personalSig) {
            styleSignatureSection = buildSignaturePromptSection(
              personalSig.signature_text
            );
          }
        } catch (err) {
          console.error("[revise-selection] Personal style signature error:", err);
        }
      }
    }

    // Build system prompt - duty descriptions have fundamentally different writing rules
    let systemPrompt = isDutyDescription 
      ? buildDutyDescriptionPrompt(mode, modeInstructions, aggressivenessInstructions, fillInstructions, styleGuidance, fewShotExamples, versionCount, userDutyDescriptionPrompt)
      : buildStatementPrompt(mode, modeInstructions, aggressivenessInstructions, fillInstructions, styleGuidance, fewShotExamples, verbsToAvoid, availableVerbs, versionCount);

    // Append style signature to system prompt if available
    if (styleSignatureSection) {
      systemPrompt += `\n\n${styleSignatureSection}`;
    }

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
${isDutyDescription ? "⚠️ DUTY DESCRIPTION - Use PRESENT TENSE only. Describe scope & responsibility factually. NO performance verbs, NO subjective adjectives, NO accomplishment results." : ""}
${mode === "expand" ? "Make it LONGER with more descriptive words." : mode === "compress" ? "Make it SHORTER with concise words and abbreviations." : isDutyDescription ? "Rephrase with improved word economy and flow while keeping present tense and factual scope." : "Improve quality while keeping similar length."}
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
    return handleLLMError(error, "POST /api/revise-selection", requestModelId);
  }
}

