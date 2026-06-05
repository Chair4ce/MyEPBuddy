import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded, handleBurstRateLimited } from "@/lib/llm-error-handler";
import { 
  getUserStyleContext, 
  buildStyleGuidance, 
  buildFewShotExamples,
  triggerStyleProcessing 
} from "@/lib/style-learning";
import type { StyleExampleCategory, WritingStyle } from "@/types/database";
import { getChainStyleSignature, getUserStyleSignature, buildSignaturePromptSection } from "@/lib/style-signatures";
import { resolveRequestedModel } from "@/app/actions/ai-models";
import { checkAndTrackUsage } from "@/lib/usage-tracker";
import { resolveStoredDutyDescriptionPrompt } from "@/lib/default-llm-prompts";

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

/**
 * Extract numbers, metrics, and acronyms present in source text.
 * Injected into prompts so the model knows which facts it may reference.
 */
function extractSourceFacts(text: string): string {
  const numbers = [...new Set(text.match(/\d[\d,.$%KMBkb]*/g) ?? [])];
  const acronyms = [...new Set(text.match(/\b[A-Z]{2,}(?:-[A-Z]+)?\b/g) ?? [])];
  const properNouns = [...new Set(
    (text.match(/\b[A-Z][a-z]+(?:'s)?\b/g) ?? []).filter(
      (word) => !["As", "During", "The", "His", "Her", "He", "She"].includes(word)
    )
  )];

  const lines: string[] = [];
  if (numbers.length > 0) lines.push(`- Numbers/metrics in source: ${numbers.join(", ")}`);
  if (acronyms.length > 0) lines.push(`- Acronyms in source: ${acronyms.join(", ")}`);
  if (properNouns.length > 0) lines.push(`- Proper nouns in source: ${properNouns.join(", ")}`);

  return lines.length > 0
    ? lines.join("\n")
    : "- No discrete numbers or acronyms detected — do not add any.";
}

function buildFactualIntegrityPrompt(isDutyDescription: boolean): string {
  if (isDutyDescription) {
    return `**⚠️ ZERO FABRICATION POLICY (HIGHEST PRIORITY) ⚠️**

You are REPHRASING existing duty description text — NOT writing a performance statement.

**NEVER ADD:**
- Personnel counts not in source (e.g., "1000+ personnel", "58K users")
- Geographic scope not in source (e.g., "across 10 nations", "multiple theaters", "global missions")
- Impact/outcome clauses (e.g., "enabling joint operations", "ensuring mission readiness", "vital for command & control")
- New adjectives that imply performance (e.g., "critical", "significant", "inaugural" unless replacing equivalent wording)
- New responsibilities, programs, or organizations not in the source

**ONLY ALLOWED CHANGES:**
- Synonyms for existing words (e.g., "drives" → "leads" only if present tense scope verb)
- Reordering clauses while preserving every factual element
- Expanding abbreviations already in source (e.g., "AF" → "Air Force" if space allows)
- Structural openers (e.g., "As a..." → "Serving as...")

**BAD REVISION (invented facts):**
"As crew operations SME, he directs a 3-member team during a critical AF transition, enabling enhanced joint operations & strategic readiness for 1000+ personnel across 10 nations."

**GOOD REVISION (same facts, better phrasing):**
"Serving as crew operations subject matter expert, he drives a 3-member cyber event coordination team during a numbered AF transition, supporting AFSOUTH's elevation to a Service Component Command and establishing AFSOUTH's first MAJCOM Cyber Coordination Center."

Stay within ±20% of the original length. A shorter truthful revision beats a longer fabricated one.`;
  }

  return `**⚠️ ZERO FABRICATION POLICY (HIGHEST PRIORITY) ⚠️**

You are revising EXISTING text. Every fact in your output must trace to the source selection or full statement context.

**NEVER INVENT:**
- Numbers, dollar amounts, percentages, or quantities not in the input
- Personnel counts, unit sizes, or geographic scope not stated
- Impact outcomes or mission results not described in source (e.g., "ensuring mission success", "bolstering global ops")
- Unit names, project names, timelines, or programs not mentioned

**IF INPUT IS VAGUE:** Improve structure and word choice only — do NOT add specificity the user did not provide.

**LENGTH:** Stay within ±20% of the original selection length. Use longer synonyms only for concepts already in the text — never pad with new facts.`;
}

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
  styleGuidance: string,
  fewShotExamples: string,
  versionCount: number,
  userCustomPrompt?: string | null,
): string {
  // Override mode instructions for duty descriptions
  const dutyModeOverride: Record<string, string> = {
    expand: `**MODE: EXPAND (use longer words to fill more space)**
Your goal is to make the selected text LONGER by:
- Using longer synonyms for words already in the text
- Expanding abbreviations to full words where space allows (e.g., "AF" → "Air Force")
- Adding positional framing (e.g., "As a [role]" → "Serving as [position]")
- NEVER add new team sizes, personnel counts, organizations, or impact clauses not in source
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

  const basePrompt = resolveStoredDutyDescriptionPrompt(userCustomPrompt);

  return `${basePrompt}

${buildFactualIntegrityPrompt(true)}

${dutyModeOverride[mode]}

${aggressivenessInstructions}

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
10. AVOID the word "the" where possible - it wastes characters
11. Stay within ±20% of the original length — never pad with invented facts`;
}

/**
 * Build system prompt for MPA STATEMENT revisions (performance/accomplishment statements).
 * These use past-tense action verbs and describe the member's accomplishments and impact.
 */
function buildStatementPrompt(
  mode: "expand" | "compress" | "general",
  modeInstructions: Record<string, string>,
  aggressivenessInstructions: string,
  styleGuidance: string,
  fewShotExamples: string,
  verbsToAvoid: string[],
  availableVerbs: string[],
  versionCount: number,
): string {
  return `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

Your task is to revise the selected portion of text while maintaining coherence with the surrounding context.

${buildFactualIntegrityPrompt(false)}

${modeInstructions[mode]}

${aggressivenessInstructions}

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
- Replace virtually all words except facts present in the source
- Use entirely new sentence structure and approach
- Only preserve facts from source: numbers, percentages, dollar amounts, proper nouns, organizations, scope elements
- NEVER invent new metrics, personnel counts, or impact outcomes to fill space
- Create a completely fresh take while maintaining factual accuracy`;
      }
    };
    
    if (!fullStatement || !selectedText) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Usage tracking — enforce weekly limit for default-key users
    const resolvedModel = await resolveRequestedModel(model, "generate");
    const usageCheck = await checkAndTrackUsage(user.id, "revise_selection", resolvedModel, userKeys);
    if (!usageCheck.allowed) {
      return usageCheck.rateLimited
        ? handleBurstRateLimited()
        : handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    // Cost reduction: force cheapest model for default-key users
    const effectiveModel = usageCheck.effectiveModel;
    requestModelId = effectiveModel;
    const modelProvider = getModelProvider(effectiveModel, userKeys);

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
- Reframe the accomplishment from a new angle using ONLY facts from the source
- Preserve all quantification from the source — never add new metrics or impact
- Each of your 3 alternatives should use DIFFERENT verbs from each other
- Target length: ~${selectedText.length} characters (within 20% of original)`,
    };
    
    // Get available verbs (exclude used ones)
    const availableVerbs = RECOMMENDED_VERBS.filter(v => !verbsToAvoid.includes(v.toLowerCase()));

    const aggressivenessInstructions = getAggressivenessInstructions(aggressiveness);
    const sourceFacts = extractSourceFacts(selectedText);

    // Build style guidance from user's learned preferences
    const styleGuidance = buildStyleGuidance(styleContext);
    const fewShotExamples = buildFewShotExamples(styleContext, "USER'S APPROVED STATEMENTS (match this style)");

    // Load style signature for chain_of_command or personal style (non-duty-description only)
    // Skip for default-key users to avoid extra DB queries and OpenAI signature costs
    let styleSignatureSection = "";
    if (!usageCheck.usingDefaultKey && !isDutyDescription && rateeRank && rateeAfsc) {
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
      ? buildDutyDescriptionPrompt(mode, modeInstructions, aggressivenessInstructions, styleGuidance, fewShotExamples, versionCount, userDutyDescriptionPrompt)
      : buildStatementPrompt(mode, modeInstructions, aggressivenessInstructions, styleGuidance, fewShotExamples, verbsToAvoid, availableVerbs, versionCount);

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

**SOURCE FACTS (do NOT add any facts beyond these):**
${sourceFacts}

${context ? `ADDITIONAL GUIDANCE: ${context}` : ""}

MODE: ${mode.toUpperCase()}
${isDutyDescription ? "⚠️ DUTY DESCRIPTION - Use PRESENT TENSE only. Describe scope & responsibility factually. NO performance verbs, NO subjective adjectives, NO accomplishment results. REPHRASE ONLY — do not invent impact, personnel counts, or geographic scope." : "⚠️ REPHRASE ONLY — do not invent metrics, personnel counts, or impact not in the source."}
${mode === "expand" ? "Make it LONGER with longer synonyms for existing content only — never add new facts." : mode === "compress" ? "Make it SHORTER with concise words and abbreviations." : isDutyDescription ? "Rephrase with improved word economy and flow while keeping present tense and every factual element from the source." : "Improve quality while keeping similar length and the same facts."}
AGGRESSIVENESS: ${aggressiveness}% (${aggressiveness <= 20 ? "minimal changes" : aggressiveness <= 40 ? "conservative" : aggressiveness <= 60 ? "moderate" : aggressiveness <= 80 ? "aggressive" : "maximum rewrite"})
LENGTH: Stay within ±20% of the original ${selectedText.length} characters. Do NOT pad with invented facts.

Generate ${versionCount} revisions of ONLY the selected portion.

Return JSON array only: [${Array.from({ length: versionCount }, (_, i) => `"revision${i + 1}"`).join(", ")}]`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: isDutyDescription ? 0.4 : 0.7,
      maxOutputTokens: 500,
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

    // Trigger async style processing (fire-and-forget) — skip for default-key users
    if (!usageCheck.usingDefaultKey) {
      triggerStyleProcessing(user.id);
    }

    return NextResponse.json({ 
      revisions,
      original: selectedText,
    });
  } catch (error) {
    return handleLLMError(error, "POST /api/revise-selection", requestModelId);
  }
}

