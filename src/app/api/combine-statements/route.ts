import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded } from "@/lib/llm-error-handler";
import { scanTextForLLM } from "@/lib/sensitive-data-scanner";
import { checkAndTrackUsage, DEFAULT_KEY_MODEL } from "@/lib/usage-tracker";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface CombineRequest {
  statements: string[];
  targetChars: number;
  model: string;
  mpa: string;
}

export async function POST(request: Request) {
  let modelId: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CombineRequest = await request.json();
    const { statements, targetChars, model, mpa } = body;

    if (!statements || statements.length === 0) {
      return NextResponse.json({ error: "No statements provided" }, { status: 400 });
    }

    // Scan statement text for PII/CUI/classification markings before sending to LLM
    for (const stmt of statements) {
      const { blocked, matches } = scanTextForLLM(stmt);
      if (blocked) {
        const types = [...new Set(matches.map((m) => m.label))].join(", ");
        return NextResponse.json(
          { error: `Sensitive data detected (${types}). Please remove before combining.` },
          { status: 400 }
        );
      }
    }

    // Get user API keys (decrypted)
    const apiKeys = await getDecryptedApiKeys();
    modelId = model;

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(user.id, "combine_statements", modelId, apiKeys);
    if (!usageCheck.allowed) {
      return handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    const effectiveModel = usageCheck.usingDefaultKey ? DEFAULT_KEY_MODEL : modelId;
    const modelProvider = getModelProvider(effectiveModel, apiKeys);

    const systemPrompt = `You are an expert Air Force EPB statement writer. Your task is to combine multiple performance statements into ONE cohesive, high-quality statement.

RULES:
1. The combined statement MUST be ${targetChars} characters or less
2. READABILITY IS #1 PRIORITY: Combined statement must be scannable in 2-3 seconds
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses total - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent tense throughout)
   - Place the STRONGEST IMPACT at the END
   - If it sounds like a run-on when read aloud, prioritize the most impactful elements
4. Preserve the most important metrics and impacts from each source
5. Create a flowing narrative that connects accomplishments naturally
6. NEVER use: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"
7. Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered
8. Format: [Action] + [Scope/Details] + [BIGGEST IMPACT LAST]
9. Do NOT use bullet points or numbered lists
10. Output ONLY the combined statement text, no quotes or explanation`;

    const userPrompt = `Combine these ${statements.length} EPB statements into ONE statement of ${targetChars} characters or less:

${statements.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}

MPA: ${mpa}
TARGET LENGTH: ${targetChars} characters maximum

CRITICAL REQUIREMENTS:
- Maximum 3-4 action clauses total - do NOT create a run-on laundry list
- Use PARALLEL verb structure throughout
- Place the STRONGEST IMPACT at the END
- Prioritize the most impactful metrics and results if you can't fit everything
- The combined statement must be readable in 2-3 seconds

GOOD EXAMPLE:
"Led 12 Airmen in rapid overhaul of 8 authentication servers, delivering wing directive 29 days ahead of schedule, ensuring uninterrupted network access for 58K users."

BAD EXAMPLE:
"Directed 12 Amn rebuilding 8 servers, advancing completion by 29 days, crafted assessment, fixed errors, purged data, averting outage, streamlining access."

Output ONLY the combined statement.`;

    const { text } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    // Clean up the response
    const combined = text.trim().replace(/^["']|["']$/g, "");

    return NextResponse.json({ combined });
  } catch (error) {
    return handleLLMError(error, "POST /api/combine-statements", modelId);
  }
}

