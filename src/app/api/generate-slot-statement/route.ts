import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded } from "@/lib/llm-error-handler";
import { scanAccomplishmentsForLLM } from "@/lib/sensitive-data-scanner";
import { checkAndTrackUsage, DEFAULT_KEY_MODEL } from "@/lib/usage-tracker";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface AccomplishmentData {
  action_verb: string;
  details: string;
  impact: string;
  metrics?: string | null;
}

interface GenerateSlotRequest {
  accomplishments: AccomplishmentData[];
  targetChars: number;
  model: string;
  mpa: string;
  rateeRank: string;
  rateeAfsc: string;
}

// Banned overused verbs
const BANNED_VERBS = [
  "spearheaded",
  "orchestrated", 
  "synergized",
  "leveraged",
  "impacted",
  "utilized",
  "facilitated",
];

export async function POST(request: Request) {
  let modelId: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GenerateSlotRequest = await request.json();
    const { accomplishments, targetChars, model, mpa, rateeRank, rateeAfsc } = body;

    if (!accomplishments || accomplishments.length === 0) {
      return NextResponse.json({ error: "No accomplishments provided" }, { status: 400 });
    }

    // Pre-transmission sensitive data scan — block before data reaches LLM providers
    const accScan = scanAccomplishmentsForLLM(accomplishments);
    if (accScan.blocked) {
      return NextResponse.json(
        { error: "Accomplishments contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating." },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const apiKeys = await getDecryptedApiKeys();
    modelId = model;

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(user.id, "generate_slot_statement", modelId, apiKeys);
    if (!usageCheck.allowed) {
      return handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    const effectiveModel = usageCheck.usingDefaultKey ? DEFAULT_KEY_MODEL : model;
    const modelProvider = getModelProvider(effectiveModel, apiKeys);

    const systemPrompt = `You are an expert Air Force EPB statement writer. Generate ONE high-quality EPB narrative statement from the provided accomplishments.

CRITICAL RULES:
1. The statement MUST be ${targetChars} characters or LESS - this is a hard limit
2. READABILITY IS #1 PRIORITY: Statement must be scannable in 2-3 seconds
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent verb tense throughout)
   - Place the STRONGEST IMPACT at the END of the statement
   - If it sounds like a run-on when read aloud, rewrite it more concisely
4. If multiple accomplishments are provided, synthesize into ONE cohesive statement
5. Preserve the most important metrics and impacts
6. NEVER use banned verbs: ${BANNED_VERBS.map(v => `"${v}"`).join(", ")}
7. Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered, Accelerated
8. Structure: [Action] + [Scope/Details] + [BIGGEST IMPACT LAST]
9. Do NOT use bullet points or numbered lists
10. Do NOT end with a period (system adds one when combining)
11. Output ONLY the statement text, no quotes or explanation

CHARACTER LIMIT: ${targetChars} (aim for ${Math.floor(targetChars * 0.85)}-${targetChars})`;

    const accomplishmentText = accomplishments.map((a, i) => 
      `[${i + 1}] Action: ${a.action_verb}
   Details: ${a.details}
   Impact: ${a.impact}
   ${a.metrics ? `Metrics: ${a.metrics}` : ""}`
    ).join("\n\n");

    const userPrompt = `Generate ONE EPB statement for the "${mpa}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc}

SOURCE ACCOMPLISHMENTS:
${accomplishmentText}

${accomplishments.length > 1 ? `
IMPORTANT: Synthesize ALL ${accomplishments.length} accomplishments into ONE flowing statement.
- Maximum 3-4 action clauses total - do NOT create a laundry list
- Use PARALLEL verb structure throughout
- Place the STRONGEST IMPACT at the END
- If source has 5+ distinct actions, prioritize the most impactful ones
` : ""}

STRUCTURE: [Action] + [Scope/Details] + [BIGGEST IMPACT LAST]

GOOD EXAMPLE (readable, strong ending):
"Led 12 Airmen in rapid overhaul of 8 authentication servers, delivering wing directive 29 days ahead of schedule, ensuring uninterrupted network access for 58K users"

BAD EXAMPLE (run-on, laundry list):
"Directed 12 Amn rebuilding 8 servers, advancing completion by 29 days, crafted assessment, fixed errors, purged data, averting outage, streamlining access"

TARGET LENGTH: ${targetChars} characters maximum (aim for ${Math.floor(targetChars * 0.85)}-${targetChars})

Output ONLY the statement (no period at the end).`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    // Clean up the response
    let statement = text.trim().replace(/^["']|["']$/g, "");
    
    // Remove trailing period if present (we add it when combining)
    if (statement.endsWith(".")) {
      statement = statement.slice(0, -1);
    }

    return NextResponse.json({ statement });
  } catch (error) {
    return handleLLMError(error, "POST /api/generate-slot-statement", modelId);
  }
}

