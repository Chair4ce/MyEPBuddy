import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";

interface ReviseSelectionRequest {
  fullStatement: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  model: string;
  mode?: "expand" | "compress" | "general"; // expand = longer words, compress = shorter words
  context?: string; // Additional context for revision
  usedVerbs?: string[]; // Verbs already used in this cycle - avoid repeating
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
    const { fullStatement, selectedText, selectionStart, selectionEnd, model, mode = "general", context, usedVerbs = [] } = body;
    
    // Combine banned verbs with already-used verbs for this session
    const verbsToAvoid = [...new Set([...BANNED_VERBS, ...usedVerbs.map(v => v.toLowerCase())])];

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

    const systemPrompt = `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

Your task is to COMPLETELY REWRITE the selected portion of text with FRESH, VARIED language while maintaining coherence with the surrounding context.

${modeInstructions[mode]}

**BANNED VERBS - NEVER USE THESE (overused clichés):**
${verbsToAvoid.map(v => `- "${v}"`).join("\n")}

**RECOMMENDED STRONG VERBS (use these instead):**
${availableVerbs.slice(0, 20).join(", ")}

**FORBIDDEN PUNCTUATION (DO NOT USE UNDER ANY CIRCUMSTANCES):**
- Em-dashes: -- (ABSOLUTELY NEVER use these)
- Semicolons: ;
- Slashes: /

**USE ONLY:** Commas (,) to connect clauses

CRITICAL RULES:
1. NEVER use any verb from the BANNED list - these are overused Air Force clichés
2. Each of your 3 alternatives MUST use DIFFERENT opening verbs from each other
3. Output ONLY the revised text for the selected portion - no quotes, no explanation
4. Maintain the same general meaning but with FRESH phrasing
5. Maintain grammatical coherence with surrounding text
6. NEVER use em-dashes (--) - use COMMAS instead to connect clauses
7. If the selection starts at the beginning of the statement and includes "- ", preserve the "- " prefix
8. READABILITY: Revised text should flow naturally when read aloud
9. PARALLELISM: Use consistent verb tense throughout (all past tense OR all present participles)
10. AVOID creating run-on laundry lists of 5+ actions - keep it focused`;

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

