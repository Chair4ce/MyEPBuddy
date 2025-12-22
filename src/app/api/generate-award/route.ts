import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { AWARD_1206_CATEGORIES, DEFAULT_AWARD_SENTENCES } from "@/lib/constants";
import type { Rank, UserLLMSettings, AwardLevel, AwardCategory, AwardSentencesPerCategory } from "@/types/database";

interface AccomplishmentData {
  id: string;
  mpa: string;
  action_verb: string;
  details: string;
  impact: string;
  metrics?: string | null;
  date: string;
}

interface GenerateAwardRequest {
  nomineeId: string;
  nomineeRank: Rank;
  nomineeAfsc: string;
  nomineeName: string;
  isManagedMember?: boolean;
  model: string;
  awardLevel: AwardLevel;
  awardCategory: AwardCategory;
  awardPeriod: string;
  // Generation config
  statementsPerEntry?: number;
  versionsPerStatement?: number;
  sentencesPerStatement?: 2 | 3;
  categoriesToGenerate?: string[];
  combineEntries?: boolean;
  accomplishments: AccomplishmentData[];
}

interface StatementGroup {
  versions: string[];
  sourceAccomplishmentIds: string[];
}

// Default award system prompt
const DEFAULT_AWARD_PROMPT = `You are an expert Air Force writer specializing in award nominations on AF Form 1206 using the current **narrative-style format** (mandated since October 2022 per DAFI 36-2406 and award guidance).

**CRITICAL FORMAT REQUIREMENTS:**
1. EVERY statement MUST begin with a dash and space: "- " followed by the statement text
2. ABSOLUTELY NO EM-DASHES (--) ANYWHERE IN THE TEXT. This is strictly prohibited.
3. Use ONLY commas to connect clauses. Never use semicolons, slashes, or em-dashes.

**FORBIDDEN PUNCTUATION (DO NOT USE):**
- Em-dashes: -- (NEVER use these under any circumstances)
- Semicolons: ;
- Slashes: /

**ALLOWED PUNCTUATION:**
- Commas: , (use these to connect clauses)
- Periods: .
- The leading dash-space: "- " (only at the start of each statement)

Key guidelines for narrative-style statements:
- Write clear, concise, plain-language paragraphs (1-3 sentences each; treat each as a standalone statement).
- Each statement MUST be dense and high-impact: clearly describe the nominee's Action, cascading Results (immediate → unit → mission/AF-level), and broader Impact.
- Start with a strong action verb in active voice; use third-person (e.g., "SSgt Smith led...") or implied subject for flow.
- Quantify everything possible: numbers, percentages, dollar amounts, time saved, personnel affected, sorties generated, readiness rates, etc.
- Chain impacts using COMMAS: "accomplished X, enabling Y, which drove Z across the squadron/wing/AF."
- Connect to larger context: readiness, lethality, deployment capability, inspections (UCI, CCIP, etc.), strategic goals, or Air Force priorities.
- Avoid fluff, vague words, excessive acronyms (explain on first use if needed), or personal pronouns unless natural.

Example strong statement (note: NO em-dashes, only commas):
"- Led a 12-person team in overhauling the unit's deployment processing line, slashing preparation time by 40% and enabling rapid response for 150 personnel, directly bolstered squadron readiness for contingency operations, contributing to wing's Excellent rating during recent UCI."

CHARACTER UTILIZATION STRATEGY (CRITICAL FOR 1206 SPACE CONSTRAINTS):
The AF Form 1206 has no fixed character limit but is severely constrained by physical line/space fitting in the PDF form. Statements must maximize density to fit more content without overflowing lines.
- AIM for high-density statements: Expand impacts with cascading effects, add mission context, chain results, and quantify aggressively.
- Use your military knowledge to infer/enhance reasonable outcomes (e.g., link to readiness rates, cost savings, inspection success).
- Minimize unnecessary whitespace in phrasing while maintaining readability.
- Target 300-500 characters per statement (adjust based on award level; denser for higher awards) to fill available space effectively.
- Prioritize narrow characters (e.g., i, l, t over m, w) where natural; use standard abbreviations to reduce width.

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}`;

// Default settings for award generation
const DEFAULT_AWARD_SETTINGS = {
  award_sentences_per_category: DEFAULT_AWARD_SENTENCES as unknown as AwardSentencesPerCategory,
  award_abbreviations: [],
  award_style_guidelines: "MAXIMIZE density for 1206 space constraints. Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Use standard AF abbreviations liberally.",
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
};

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

function buildAwardSystemPrompt(
  settings: Partial<UserLLMSettings>,
  nomineeRank: Rank
): string {
  const rankVerbs = settings.rank_verb_progression?.[nomineeRank] || 
    DEFAULT_AWARD_SETTINGS.rank_verb_progression[nomineeRank as keyof typeof DEFAULT_AWARD_SETTINGS.rank_verb_progression] || {
      primary: ["Led", "Managed"],
      secondary: ["Executed", "Coordinated"],
    };

  const abbreviations = settings.award_abbreviations || [];
  const abbreviationsList = abbreviations.length > 0
    ? abbreviations.map(a => `${a.word} → ${a.abbreviation}`).join(", ")
    : "Use standard AF abbreviations (Amn, NCO, sq, flt, hrs, maint, ops, etc.)";

  const rankVerbGuidance = `Primary verbs: ${rankVerbs.primary.join(", ")}\nSecondary verbs: ${rankVerbs.secondary.join(", ")}`;

  let prompt = settings.award_system_prompt || DEFAULT_AWARD_PROMPT;
  prompt = prompt.replace(/\{\{ratee_rank\}\}/g, nomineeRank);
  prompt = prompt.replace(/\{\{primary_verbs\}\}/g, rankVerbs.primary.join(", "));
  prompt = prompt.replace(/\{\{rank_verb_guidance\}\}/g, rankVerbGuidance);
  prompt = prompt.replace(/\{\{abbreviations_list\}\}/g, abbreviationsList);

  return prompt;
}

function getAwardLevelGuidance(level: AwardLevel): string {
  const guidance: Record<AwardLevel, string> = {
    squadron: "Focus on flight/squadron-level impacts. Highlight team leadership and unit mission success.",
    group: "Emphasize group-wide contributions. Show cross-functional coordination and group mission enhancement.",
    wing: "Demonstrate wing-level impact. Connect to installation readiness, multi-squadron influence, and wing priorities.",
    majcom: "Highlight MAJCOM-wide significance. Show enterprise-level thinking, policy influence, and broad mission impact.",
    haf: "Emphasize Air Force-wide impact. Connect to service-level initiatives, joint operations, and strategic goals.",
  };
  return guidance[level] || guidance.squadron;
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

    const body: GenerateAwardRequest = await request.json();
    const {
      nomineeRank,
      nomineeAfsc,
      nomineeName,
      model,
      awardLevel,
      awardCategory,
      awardPeriod,
      statementsPerEntry = 1,
      versionsPerStatement = 3,
      sentencesPerStatement = 2,
      categoriesToGenerate,
      combineEntries = false,
      accomplishments,
    } = body;

    if (!nomineeRank || !accomplishments || accomplishments.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user's LLM settings
    const { data: userSettings } = await supabase
      .from("user_llm_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const settings = userSettings as unknown as Partial<UserLLMSettings> || {};

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

    const systemPrompt = buildAwardSystemPrompt(settings, nomineeRank);
    const modelProvider = getModelProvider(model, userKeys);

    // Get sentences per category from settings or use defaults
    const sentencesPerCategory = settings.award_sentences_per_category || 
      DEFAULT_AWARD_SETTINGS.award_sentences_per_category;

    // Map MPAs to 1206 categories
    // Leadership & Job Performance: executing_mission, leading_people, managing_resources
    // Self-Improvement: improving_unit (education/training focused entries)
    // Base/Community: volunteer work, community activities
    const mpaTo1206Category: Record<string, string> = {
      executing_mission: "leadership_job_performance",
      leading_people: "leadership_job_performance",
      managing_resources: "leadership_job_performance",
      improving_unit: "significant_self_improvement",
      // Allow direct mapping if entries are already tagged with 1206 categories
      leadership_job_performance: "leadership_job_performance",
      significant_self_improvement: "significant_self_improvement",
      base_community_involvement: "base_community_involvement",
    };

    // Group accomplishments by 1206 category
    const accomplishmentsByCategory = accomplishments.reduce(
      (acc, a) => {
        // Map MPA to 1206 category, default to leadership_job_performance
        const category1206 = mpaTo1206Category[a.mpa] || "leadership_job_performance";
        if (!acc[category1206]) acc[category1206] = [];
        acc[category1206].push(a);
        return acc;
      },
      {} as Record<string, AccomplishmentData[]>
    );

    const results: { category: string; statementGroups: StatementGroup[] }[] = [];
    const levelGuidance = getAwardLevelGuidance(awardLevel);

    // Filter categories to generate
    const targetCategories = categoriesToGenerate && categoriesToGenerate.length > 0
      ? AWARD_1206_CATEGORIES.filter(c => categoriesToGenerate.includes(c.key))
      : AWARD_1206_CATEGORIES;

    // Generate statements for each 1206 category
    for (const category of targetCategories) {
      const categoryAccomplishments = accomplishmentsByCategory[category.key] || [];

      // Skip if no accomplishments for this category
      if (categoryAccomplishments.length === 0) {
        continue;
      }

      const categoryResults: StatementGroup[] = [];

      if (combineEntries) {
        // COMBINE MODE: Merge all accomplishments into one powerful statement
        const combinedPrompt = `Generate ${statementsPerEntry} HIGH-DENSITY AF Form 1206 narrative statement(s) for the "${category.heading}" section.
For EACH statement, provide ${versionsPerStatement} different versions so the user can choose the best one.

IMPORTANT: COMBINE all the accomplishments below into cohesive, powerful statement(s). If there are similar metrics (like volunteer hours, training counts, etc.), SUM THEM UP and present the aggregated total.

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}

SOURCE ACCOMPLISHMENTS TO COMBINE:
${categoryAccomplishments
  .map(
    (a, i) => `
[${i + 1}] Action: ${a.action_verb}
    Details: ${a.details}
    Impact: ${a.impact}
    ${a.metrics ? `Metrics: ${a.metrics}` : ""}
    Date: ${new Date(a.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
`
  )
  .join("")}

COMBINATION INSTRUCTIONS:
- Identify similar activities and merge them (e.g., "volunteered 4 hrs" + "volunteered 7 hrs" = "volunteered 11 hrs")
- Sum up any numerical metrics that can be combined
- Create a cohesive narrative that covers all the key accomplishments
- Prioritize the most impactful elements if space is limited

**SENTENCE COUNT - THIS IS MANDATORY:**
Each statement MUST contain EXACTLY ${sentencesPerStatement} sentences. Not ${sentencesPerStatement === 2 ? "3" : "2"}, not ${sentencesPerStatement === 2 ? "1" : "4"}. EXACTLY ${sentencesPerStatement} sentences.
${sentencesPerStatement === 2 
  ? "TWO sentences only. Count them: Sentence 1. Sentence 2. STOP."
  : "THREE sentences only. Count them: Sentence 1. Sentence 2. Sentence 3. STOP."}

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **EXACTLY ${sentencesPerStatement} SENTENCES** - count periods to verify before outputting
3. Each statement should be ${sentencesPerStatement === 2 ? "150-280" : "280-420"} characters
4. Write in narrative-style (complete sentences/paragraphs, not bullet format)
5. MAXIMIZE density: Chain impacts, quantify aggressively, add mission context
6. Start with strong action verbs in active voice
7. Connect to ${awardLevel}-level mission impact

**PUNCTUATION - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- ONLY use commas (,) to connect clauses and chain impacts

Generate EXACTLY ${statementsPerEntry} statement group(s), each with ${versionsPerStatement} alternative versions.
VERIFY: Each statement has EXACTLY ${sentencesPerStatement} sentences (${sentencesPerStatement} periods).

Format as JSON array of arrays (EACH statement must start with "- "):
[
  ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"],
  ...
]`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: combinedPrompt,
            temperature: 0.75,
            maxTokens: 3000,
          });

          const parsed = parseStatementResponse(text, statementsPerEntry);
          for (const versions of parsed) {
            categoryResults.push({
              versions,
              sourceAccomplishmentIds: categoryAccomplishments.map(a => a.id),
            });
          }
        } catch (error) {
          console.error(`Error generating combined for ${category.key}:`, error);
        }
      } else {
        // SEPARATE MODE: Generate statements for each entry individually
        for (const accomplishment of categoryAccomplishments) {
          const individualPrompt = `Generate ${statementsPerEntry} HIGH-DENSITY AF Form 1206 narrative statement(s) for the "${category.heading}" section.
For EACH statement, provide ${versionsPerStatement} different versions so the user can choose the best one.

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}

SOURCE ACCOMPLISHMENT:
Action: ${accomplishment.action_verb}
Details: ${accomplishment.details}
Impact: ${accomplishment.impact}
${accomplishment.metrics ? `Metrics: ${accomplishment.metrics}` : ""}
Date: ${new Date(accomplishment.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}

**SENTENCE COUNT - THIS IS MANDATORY:**
Each statement MUST contain EXACTLY ${sentencesPerStatement} sentences. Not ${sentencesPerStatement === 2 ? "3" : "2"}, not ${sentencesPerStatement === 2 ? "1" : "4"}. EXACTLY ${sentencesPerStatement} sentences.
${sentencesPerStatement === 2 
  ? "TWO sentences only. Count them: Sentence 1. Sentence 2. STOP."
  : "THREE sentences only. Count them: Sentence 1. Sentence 2. Sentence 3. STOP."}

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **EXACTLY ${sentencesPerStatement} SENTENCES** - count periods to verify before outputting
3. Each statement should be ${sentencesPerStatement === 2 ? "150-280" : "280-420"} characters
4. Write in narrative-style (complete sentences/paragraphs, not bullet format)
5. MAXIMIZE density: Chain impacts, quantify aggressively, add mission context
6. Start with strong action verbs in active voice
7. Connect to ${awardLevel}-level mission impact
8. Include the nominee's name or rank naturally when appropriate

**PUNCTUATION - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- ONLY use commas (,) to connect clauses and chain impacts

Generate EXACTLY ${statementsPerEntry} statement group(s), each with ${versionsPerStatement} alternative versions.
VERIFY: Each statement has EXACTLY ${sentencesPerStatement} sentences (${sentencesPerStatement} periods).

Format as JSON array of arrays (EACH statement must start with "- "):
[
  ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"],
  ...
]`;

          try {
            const { text } = await generateText({
              model: modelProvider,
              system: systemPrompt,
              prompt: individualPrompt,
              temperature: 0.75,
              maxTokens: 2000,
            });

            const parsed = parseStatementResponse(text, statementsPerEntry);
            for (const versions of parsed) {
              categoryResults.push({
                versions,
                sourceAccomplishmentIds: [accomplishment.id],
              });
            }
          } catch (error) {
            console.error(`Error generating for ${category.key} entry:`, error);
          }
        }
      }

      if (categoryResults.length > 0) {
        results.push({ category: category.key, statementGroups: categoryResults });
      }
    }

    // Helper function to parse LLM response
    function parseStatementResponse(text: string, expectedCount: number): string[][] {
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          // Check if it's array of arrays or flat array
          if (Array.isArray(parsed[0])) {
            return parsed.slice(0, expectedCount);
          } else {
            // Flat array - each item is a single version
            return parsed.slice(0, expectedCount).map((s: string) => [s]);
          }
        }
      } catch {
        // Fallback: split by newlines
      }
      
      const lines = text
        .split("\n")
        .filter((line) => line.trim().length > 50)
        .slice(0, expectedCount);
      return lines.map(line => [line]);
    }

    return NextResponse.json({ statements: results });
  } catch (error) {
    console.error("Generate Award API error:", error);
    return NextResponse.json(
      { error: "Failed to generate award statements" },
      { status: 500 }
    );
  }
}

