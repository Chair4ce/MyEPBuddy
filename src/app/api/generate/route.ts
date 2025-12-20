import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { DEFAULT_ACRONYMS, formatAcronymsList } from "@/lib/default-acronyms";
import { DEFAULT_ABBREVIATIONS, formatAbbreviationsList } from "@/lib/default-abbreviations";
import { STANDARD_MGAS } from "@/lib/constants";
import type { Rank, WritingStyle, UserLLMSettings, MajorGradedArea, Acronym, Abbreviation } from "@/types/database";

interface AccomplishmentData {
  mpa: string;
  action_verb: string;
  details: string;
  impact: string;
  metrics?: string | null;
}

interface GenerateRequest {
  rateeId: string;
  rateeRank: Rank;
  rateeAfsc: string;
  cycleYear: number;
  model: string;
  writingStyle: WritingStyle;
  accomplishments: AccomplishmentData[];
}

interface ExampleStatement {
  mpa: string;
  statement: string;
  source: "personal" | "community";
}

// Default settings if user hasn't configured their own
const DEFAULT_SETTINGS: Partial<UserLLMSettings> = {
  max_characters_per_statement: 350,
  scod_date: "31 March",
  current_cycle_year: new Date().getFullYear(),
  major_graded_areas: STANDARD_MGAS, // Always use standard MPAs
  rank_verb_progression: {
    AB: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Participated"] },
    Amn: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Executed"] },
    A1C: { primary: ["Executed", "Performed", "Supported"], secondary: ["Assisted", "Contributed", "Maintained"] },
    SrA: { primary: ["Executed", "Coordinated", "Managed"], secondary: ["Led", "Supervised", "Trained"] },
    SSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Supervised", "Coordinated", "Developed"] },
    TSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Spearheaded", "Orchestrated", "Championed"] },
    MSgt: { primary: ["Directed", "Spearheaded", "Orchestrated"], secondary: ["Championed", "Transformed", "Pioneered"] },
    SMSgt: { primary: ["Spearheaded", "Orchestrated", "Championed"], secondary: ["Transformed", "Pioneered", "Revolutionized"] },
    CMSgt: { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Revolutionized", "Institutionalized", "Shaped"] },
  },
  style_guidelines: "MAXIMIZE character usage (aim for 280-350 chars). Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Use standard AF abbreviations for efficiency.",
  base_system_prompt: `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant with deep knowledge of Air Force operations, programs, and terminology. Your sole purpose is to generate impactful, narrative-style performance statements that strictly comply with AFI 36-2406 (22 Aug 2025).

CRITICAL RULES - NEVER VIOLATE THESE:
- Every statement MUST be a single, standalone sentence.
- Every statement MUST contain: 1) a strong action AND 2) cascading impacts (immediate → unit → mission/AF-level).
- Character range: AIM for {{max_characters_per_statement}} characters. Minimum 280 characters, maximum {{max_characters_per_statement}}.
- Generate exactly 2–3 strong statements per Major Performance Area.
- Output pure, clean text only — no formatting.

CHARACTER UTILIZATION STRATEGY (CRITICAL):
You are UNDERUTILIZING available space. Statements should be DENSE with impact. To maximize character usage:
1. EXPAND impacts: Show cascading effects (individual → team → squadron → wing → AF/DoD)
2. ADD context: Connect actions to larger mission objectives, readiness, or strategic goals
3. CHAIN results: "improved X, enabling Y, which drove Z"
4. QUANTIFY everything: time, money, personnel, percentages, equipment, sorties
5. USE military knowledge: Infer standard AF outcomes (readiness rates, deployment timelines, inspection results)

CONTEXTUAL ENHANCEMENT (USE YOUR MILITARY KNOWLEDGE):
When given limited input, ENHANCE statements using your knowledge of:
- Air Force programs, inspections, and evaluations (UCI, CCIP, ORI, NSI, etc.)
- Standard military outcomes (readiness, lethality, deployment capability, compliance)
- Organizational impacts (flight, squadron, group, wing, MAJCOM, CCMD, joint/coalition)
- Common metrics (sortie generation rates, mission capable rates, on-time delivery, cost savings)
- Military operations and exercises (deployment, contingency, humanitarian, training)

Example transformation:
- INPUT: "Volunteered at USO for 4 hrs, served 200 Airmen"
- OUTPUT: "Spearheaded USO volunteer initiative, dedicating 4 hrs to restore lounge facilities and replenish refreshment stations--directly boosted morale for 200 deploying Amn, reinforcing vital quality-of-life support that sustained mission focus during high-tempo ops"

ACRONYM & ABBREVIATION POLICY:
- Use standard AF acronyms to maximize character efficiency (Amn, NCO, SNCO, DoD, AF, sq, flt, hrs)
- Spell out uncommon terms for clarity
- Apply auto-abbreviations from the provided list

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
{{rank_verb_guidance}}
- AB–SrA: Individual execution with team impact
- SSgt–TSgt: Supervisory scope with flight/squadron impact
- MSgt–CMSgt: Strategic leadership with wing/MAJCOM/AF impact

STATEMENT STRUCTURE:
[Strong action verb] + [specific accomplishment with context] + [immediate result] + [cascading mission impact]

IMPACT AMPLIFICATION TECHNIQUES:
- Connect to readiness: "ensured 100% combat readiness"
- Link to cost: "saved $X" or "managed $X budget"
- Show scale: "across X personnel/units/missions"
- Reference inspections: "contributed to Excellent rating"
- Tie to deployments: "supported X deployed members"
- Quantify time: "reduced processing by X hrs/days"

MAJOR PERFORMANCE AREAS:
{{mga_list}}

ADDITIONAL STYLE GUIDANCE:
{{style_guidelines}}

Using the provided accomplishment entries, generate 2–3 HIGH-DENSITY statements for each MPA. Use your military expertise to EXPAND limited inputs into comprehensive statements that approach the character limit. Infer reasonable military context and standard AF outcomes.

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}`,
  acronyms: DEFAULT_ACRONYMS,
  abbreviations: DEFAULT_ABBREVIATIONS,
};

async function fetchExampleStatements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  afsc: string,
  rank: Rank,
  writingStyle: WritingStyle
): Promise<ExampleStatement[]> {
  const examples: ExampleStatement[] = [];

  if (writingStyle === "personal" || writingStyle === "hybrid") {
    const { data: personalData } = await supabase
      .from("refined_statements")
      .select("mpa, statement")
      .eq("user_id", userId)
      .eq("afsc", afsc)
      .order("created_at", { ascending: false })
      .limit(10);

    if (personalData) {
      examples.push(
        ...(personalData as { mpa: string; statement: string }[]).map((s) => ({
          mpa: s.mpa,
          statement: s.statement,
          source: "personal" as const,
        }))
      );
    }
  }

  if (writingStyle === "community" || writingStyle === "hybrid") {
    // Fetch top 20 community-voted statements for this AFSC
    // These are the highest-rated examples as voted by the community
    const { data: communityData } = await supabase
      .from("community_statements")
      .select("mpa, statement, upvotes, downvotes")
      .eq("afsc", afsc)
      .eq("is_approved", true)
      .order("upvotes", { ascending: false })
      .limit(50); // Fetch extra to sort by net votes

    if (communityData) {
      // Sort by net votes (upvotes - downvotes) and take top 20
      const typedData = communityData as { mpa: string; statement: string; upvotes: number; downvotes: number }[];
      const sortedByNetVotes = typedData
        .map((s) => ({
          ...s,
          netVotes: s.upvotes - (s.downvotes || 0),
        }))
        .sort((a, b) => b.netVotes - a.netVotes)
        .slice(0, 20);

      examples.push(
        ...sortedByNetVotes.map((s) => ({
          mpa: s.mpa,
          statement: s.statement,
          source: "community" as const,
        }))
      );
    }
  }

  return examples;
}

function buildSystemPrompt(
  settings: Partial<UserLLMSettings>,
  rateeRank: Rank,
  examples: ExampleStatement[]
): string {
  const rankVerbs = settings.rank_verb_progression?.[rateeRank] || {
    primary: ["Led", "Managed"],
    secondary: ["Executed", "Coordinated"],
  };

  const acronyms = settings.acronyms || DEFAULT_ACRONYMS;
  const acronymsList = formatAcronymsList(acronyms);
  
  const abbreviations = settings.abbreviations || DEFAULT_ABBREVIATIONS;
  const abbreviationsList = formatAbbreviationsList(abbreviations);
  
  // Build MGA list - always use standard MPAs for all users
  const mgaList = STANDARD_MGAS.map((m) => `- ${m.label}`).join("\n");
  
  // Build rank verb guidance
  const rankVerbGuidance = `Primary verbs: ${rankVerbs.primary.join(", ")}\n  Secondary verbs: ${rankVerbs.secondary.join(", ")}`;

  let prompt = settings.base_system_prompt || DEFAULT_SETTINGS.base_system_prompt!;
  prompt = prompt.replace(
    /\{\{max_characters_per_statement\}\}/g,
    String(settings.max_characters_per_statement || 350)
  );
  prompt = prompt.replace(/\{\{ratee_rank\}\}/g, rateeRank);
  prompt = prompt.replace(
    /\{\{primary_verbs\}\}/g,
    rankVerbs.primary.join(", ")
  );
  prompt = prompt.replace(/\{\{rank_verb_guidance\}\}/g, rankVerbGuidance);
  prompt = prompt.replace(/\{\{mga_list\}\}/g, mgaList);
  prompt = prompt.replace(/\{\{style_guidelines\}\}/g, settings.style_guidelines || "");
  prompt = prompt.replace(/\{\{acronyms_list\}\}/g, acronymsList);
  prompt = prompt.replace(/\{\{abbreviations_list\}\}/g, abbreviationsList);

  if (examples.length > 0) {
    prompt += `\n\nEXAMPLE STATEMENTS TO EMULATE:
The following are high-quality example statements that demonstrate the desired writing style:

${examples
  .slice(0, 6)
  .map((ex, i) => `${i + 1}. [${ex.mpa}] ${ex.statement}`)
  .join("\n")}

Maintain a similar voice and quality in your generated statements.`;
  }

  return prompt;
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

    const body: GenerateRequest = await request.json();
    const { rateeId, rateeRank, rateeAfsc, cycleYear, model, writingStyle, accomplishments } = body;

    if (!rateeRank || !accomplishments || accomplishments.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user's LLM settings (or use defaults)
    const { data: userSettings } = await supabase
      .from("user_llm_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const settings: Partial<UserLLMSettings> = userSettings
      ? (userSettings as unknown as UserLLMSettings)
      : DEFAULT_SETTINGS;

    // Get user API keys
    const { data: userKeysData } = await supabase
      .from("user_api_keys")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const userKeys = userKeysData as unknown as {
      openai_key?: string | null;
      anthropic_key?: string | null;
      google_key?: string | null;
      grok_key?: string | null;
    } | null;

    // Fetch example statements based on AFSC and writing style
    const examples = await fetchExampleStatements(
      supabase,
      user.id,
      rateeAfsc || "UNKNOWN",
      rateeRank,
      writingStyle || "personal"
    );

    const systemPrompt = buildSystemPrompt(settings, rateeRank, examples);
    const modelProvider = getModelProvider(model, userKeys);

    // Group accomplishments by MPA
    const accomplishmentsByMPA = accomplishments.reduce(
      (acc, a) => {
        if (!acc[a.mpa]) acc[a.mpa] = [];
        acc[a.mpa].push(a);
        return acc;
      },
      {} as Record<string, AccomplishmentData[]>
    );

    // Always use standard MPAs for all users
    const maxChars = settings.max_characters_per_statement || 350;
    const results: { mpa: string; statements: string[]; historyIds: string[] }[] = [];

    // Generate statements for each MPA (using standard MPAs for all users)
    for (const mpa of STANDARD_MGAS) {
      // Special handling for HLR Assessment - uses ALL accomplishments
      const isHLR = mpa.key === "hlr_assessment";
      const mpaAccomplishments = isHLR ? accomplishments : (accomplishmentsByMPA[mpa.key] || []);

      if (mpaAccomplishments.length === 0 && !isHLR) {
        continue;
      }

      // Skip HLR if no accomplishments at all
      if (isHLR && accomplishments.length === 0) {
        continue;
      }

      const mpaExamples = examples.filter((e) => e.mpa === mpa.key);

      // Build different prompts for HLR vs regular MPAs
      let userPrompt: string;
      
      if (isHLR) {
        // HLR-specific prompt - Commander's perspective, holistic assessment
        userPrompt = `Generate 2-3 HIGH-DENSITY Higher Level Reviewer (HLR) Assessment statements from the Commander's perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

ALL ACCOMPLISHMENTS FOR THIS CYCLE:
${accomplishments
  .map(
    (a, i) => `
[${i + 1}] [${a.mpa}] ${a.action_verb}: ${a.details}
    Impact: ${a.impact}${a.metrics ? ` | Metrics: ${a.metrics}` : ""}
`
  )
  .join("")}

HLR ASSESSMENT REQUIREMENTS:
1. TARGET: Each statement should be 280-${maxChars} characters. MAXIMIZE character usage.
2. Write from the Commander's perspective - this is the senior leader's strategic endorsement
3. Synthesize OVERALL performance across all MPAs into a cohesive narrative
4. Use your Air Force knowledge to:
   - Connect individual achievements to wing/MAJCOM/AF-level mission success
   - Infer reasonable strategic outcomes from tactical accomplishments
   - Add promotion justification language (ready for increased responsibility, etc.)
5. Use definitive language: "My top performer", "Ready for immediate promotion", "Future senior leader"

STRUCTURE EACH STATEMENT:
[Strategic assessment] + [Key accomplishment synthesis] + [Cascading organizational impact] + [Promotion recommendation]

EXAMPLE (328 chars):
"My #1 of 47 SSgts--unmatched technical expertise and leadership acumen drove 100% mission success rate across 12 contingency ops; mentored 8 Amn to BTZ while spearheading $2.3M equipment modernization that enhanced sq combat capability 40%--my strongest recommendation for TSgt, ready to lead at flight level"

Generate EXACTLY 2-3 statements. Each MUST be 280-${maxChars} characters.

Format as JSON array only:
["Statement 1", "Statement 2", "Statement 3"]`;
      } else {
        // Regular MPA prompt
        userPrompt = `Generate 2-3 HIGH-DENSITY EPB narrative statements for the "${mpa.label}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

SOURCE ACCOMPLISHMENTS:
${mpaAccomplishments
  .map(
    (a, i) => `
[${i + 1}] Action: ${a.action_verb}
    Details: ${a.details}
    Impact: ${a.impact}
    ${a.metrics ? `Metrics: ${a.metrics}` : ""}
`
  )
  .join("")}

${mpaExamples.length > 0 ? `
EXAMPLE STATEMENTS (match this density and style):
${mpaExamples.map((e, i) => `${i + 1}. ${e.statement}`).join("\n")}
` : ""}

CRITICAL REQUIREMENTS:
1. TARGET: Each statement should be 280-${maxChars} characters. DO NOT write short statements.
2. EXPAND limited inputs using your Air Force knowledge:
   - Infer standard military outcomes (readiness, compliance, mission success)
   - Add organizational context (flight, squadron, wing impact)
   - Include reasonable metrics if none provided (time saved, personnel impacted, etc.)
   - Connect actions to larger mission objectives
3. STRUCTURE: [Action] + [Accomplishment with context] + [Immediate result] + [Mission impact]
4. CHAIN impacts: "achieved X, enabling Y, which drove Z"

TRANSFORMATION EXAMPLE:
- Input: "Volunteered at USO, served snacks"
- Output (320 chars): "Orchestrated USO volunteer support operations, dedicating off-duty hours to revitalize lounge facilities and replenish refreshment stations--bolstered morale for 200+ transiting Amn during peak deployment cycle, directly supporting installation's quality-of-life mission"

Generate EXACTLY 2-3 statements. Each MUST be 280-${maxChars} characters.

Format as JSON array only:
["Statement 1", "Statement 2", "Statement 3"]`;
      }

      try {
        const { text } = await generateText({
          model: modelProvider,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.75, // Slightly higher for creative expansion
          maxTokens: 1500, // Increased for longer, denser statements
        });

        let statements: string[] = [];
        try {
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            statements = JSON.parse(jsonMatch[0]);
          } else {
            statements = text
              .split("\n")
              .filter((line) => line.trim().length > 50)
              .slice(0, 3);
          }
        } catch {
          statements = text
            .split("\n")
            .filter((line) => line.trim().length > 50)
            .slice(0, 3);
        }

        if (statements.length > 0) {
          const historyIds: string[] = [];
          
          for (const statement of statements) {
            const { data: historyData } = await supabase
              .from("statement_history")
              .insert({
                user_id: user.id,
                ratee_id: rateeId,
                mpa: mpa.key,
                afsc: rateeAfsc || "UNKNOWN",
                rank: rateeRank,
                original_statement: statement,
                model_used: model,
                cycle_year: cycleYear,
              } as never)
              .select("id")
              .single();

            if (historyData) {
              historyIds.push((historyData as { id: string }).id);
            }
          }

          results.push({ mpa: mpa.key, statements, historyIds });
        }
      } catch (error) {
        console.error(`Error generating for ${mpa.key}:`, error);
      }
    }

    return NextResponse.json({ statements: results });
  } catch (error) {
    console.error("Generate API error:", error);
    return NextResponse.json(
      { error: "Failed to generate statements" },
      { status: 500 }
    );
  }
}
