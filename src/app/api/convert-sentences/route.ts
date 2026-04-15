import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded, handleBurstRateLimited } from "@/lib/llm-error-handler";
import { checkAndTrackUsage } from "@/lib/usage-tracker";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

export async function POST(request: Request) {
  let modelId: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { statement, targetSentences, nomineeRank, nomineeName, model } = await request.json();
    modelId = model;

    if (!statement || !targetSentences || !model) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(user.id, "convert_sentences", model, userKeys);
    if (!usageCheck.allowed) {
      return usageCheck.rateLimited
        ? handleBurstRateLimited()
        : handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const modelProvider = getModelProvider(effectiveModel, userKeys);

    const systemPrompt = `You are an expert Air Force writer specializing in award nominations on AF Form 1206.

**CRITICAL FORMAT REQUIREMENTS:**
1. EVERY statement MUST begin with "- " (dash space) followed by the statement text
2. ABSOLUTELY NO EM-DASHES (--) ANYWHERE. This is strictly prohibited.

**FORBIDDEN PUNCTUATION (DO NOT USE UNDER ANY CIRCUMSTANCES):**
- Em-dashes: -- (NEVER use these)
- Semicolons: ;
- Slashes: /

**ALLOWED PUNCTUATION:**
- Commas: , (use these to connect clauses)
- Periods: .
- The leading dash-space: "- " (only at the start)

Your task is to convert statements between 2-sentence and 3-sentence formats while:
- ALWAYS starting with "- " (dash space)
- NEVER using em-dashes (--) anywhere in the text
- Preserving all key accomplishments, metrics, and impacts
- Maintaining the narrative style (no bullet points after the dash)
- Using strong action verbs and quantified results
- Keeping the statement dense and impactful
- Ensuring it fits within 1206 space constraints (300-500 characters ideal)

When REDUCING (3→2 sentences):
- Combine related ideas using COMMAS (not em-dashes)
- Remove redundant phrasing
- Merge cascading impacts
- Keep the most impactful metrics

When EXPANDING (2→3 sentences):
- Add more specific context
- Elaborate on cascading impacts
- Include additional metrics or scope
- Add mission/strategic connection`;

    const userPrompt = `Convert the following AF Form 1206 statement to EXACTLY ${targetSentences} sentences.

ORIGINAL STATEMENT:
"${statement}"

${nomineeRank && nomineeName ? `NOMINEE: ${nomineeRank} ${nomineeName}` : ""}

Generate 3 different ${targetSentences}-sentence versions. Each version MUST:
1. START with "- " (dash space) - this is REQUIRED
2. Preserve all key accomplishments and metrics
3. Maintain high impact and density
4. Use the current narrative-style format
5. Be 300-500 characters

Output as a JSON array of 3 strings (each starting with "- "):
["- Version 1 text here", "- Version 2 text here", "- Version 3 text here"]`;

    const { text: rawResponse } = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });

    let versions: string[] = [];
    try {
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        versions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: split by newlines
      versions = rawResponse
        .split("\n")
        .filter(line => line.trim().length > 50)
        .slice(0, 3);
    }

    // Ensure we have at least one version
    if (versions.length === 0) {
      versions = [statement]; // Return original if parsing fails
    }

    return NextResponse.json({ versions });
  } catch (error) {
    return handleLLMError(error, "POST /api/convert-sentences", modelId);
  }
}

