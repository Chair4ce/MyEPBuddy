import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { AWARD_1206_CATEGORIES, DEFAULT_AWARD_SENTENCES } from "@/lib/constants";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import type { Rank, UserLLMSettings, AwardLevel, AwardCategory, AwardSentencesPerCategory, WinLevel } from "@/types/database";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface AwardExampleStatement {
  category: string;
  statement: string;
  is_winning: boolean;
  win_level: WinLevel | null;
}

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
  accomplishments?: AccomplishmentData[];
  // Custom context mode
  customContext?: string;
  // Revision mode for existing statements
  existingStatement?: string;
  revisionIntensity?: number; // 0-100, controls how much the statement gets rewritten
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

// Fetch user-curated award example statements
async function fetchAwardExampleStatements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryFilter?: string | null
): Promise<AwardExampleStatement[]> {
  const examples: AwardExampleStatement[] = [];
  
  // Fetch user-curated award examples (use_as_llm_example = true)
  let query = supabase
    .from("refined_statements")
    .select("statement, award_category, is_winning_package, win_level")
    .eq("user_id", userId)
    .eq("statement_type", "award")
    .eq("use_as_llm_example", true)
    .order("created_at", { ascending: false });
  
  // Optionally filter to specific category
  if (categoryFilter) {
    query = query.eq("award_category", categoryFilter);
  }
  
  const { data } = await query.limit(20);
  
  if (data) {
    interface AwardStatementRow {
      statement: string;
      award_category: string | null;
      is_winning_package: boolean;
      win_level: WinLevel | null;
    }
    (data as AwardStatementRow[]).forEach((s) => {
      if (s.award_category) {
        examples.push({
          category: s.award_category,
          statement: s.statement,
          is_winning: s.is_winning_package,
          win_level: s.win_level,
        });
      }
    });
  }
  
  return examples;
}

// Build example statements section for the prompt
function buildExamplesSection(examples: AwardExampleStatement[], category: string): string {
  const categoryExamples = examples.filter(e => e.category === category);
  
  if (categoryExamples.length === 0) return "";
  
  // Prioritize winning examples
  const sortedExamples = [...categoryExamples].sort((a, b) => {
    // Winning at higher levels first
    const levelOrder: Record<WinLevel, number> = { haf: 5, tenant_unit: 4, wing: 3, group: 2, squadron: 1 };
    const aScore = a.is_winning ? (levelOrder[a.win_level as WinLevel] || 0) + 10 : 0;
    const bScore = b.is_winning ? (levelOrder[b.win_level as WinLevel] || 0) + 10 : 0;
    return bScore - aScore;
  });
  
  const examplesText = sortedExamples.slice(0, 5).map((e, i) => {
    const winBadge = e.is_winning && e.win_level 
      ? ` [WINNING - ${e.win_level.toUpperCase()}]` 
      : "";
    return `${i + 1}.${winBadge} ${e.statement}`;
  }).join("\n");
  
  return `

USER-CURATED EXAMPLE STATEMENTS (match this quality):
These are high-quality examples the user has saved as references:
${examplesText}

Emulate the style, density, and impact of these examples.`;
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
      customContext,
      existingStatement,
      revisionIntensity = 50,
    } = body;

    const isCustomContextMode = !!customContext && customContext.trim().length > 0;
    const isRevisionMode = !!existingStatement && existingStatement.trim().length > 0;
    
    // Map intensity to descriptive guidance
    const getIntensityGuidance = (intensity: number): string => {
      if (intensity < 25) {
        return `MINIMAL REWRITE (${intensity}% intensity):
- Keep as much of the original wording as possible
- Only change words/phrases that directly conflict with the new metrics
- Preserve the original sentence structure completely
- Make surgical, targeted edits only`;
      } else if (intensity < 50) {
        return `LIGHT REWRITE (${intensity}% intensity):
- Preserve most of the original wording and structure
- Allow minor rephrasing for better flow when incorporating new data
- Keep the overall sentence structure similar
- Focus changes on metric integration, not style`;
      } else if (intensity < 75) {
        return `MODERATE REWRITE (${intensity}% intensity):
- Balance between preserving original content and fresh writing
- Restructure sentences if it improves clarity or impact
- Feel free to rephrase for better flow
- Maintain the core message but improve delivery`;
      } else {
        return `AGGRESSIVE REWRITE (${intensity}% intensity):
- Completely rewrite the statement while incorporating the metrics
- Use fresh, powerful language and structure
- Feel free to reorganize and restructure entirely
- Only the facts/metrics should remain, not the original phrasing`;
      }
    };
    
    const intensityGuidance = isRevisionMode ? getIntensityGuidance(revisionIntensity) : '';

    if (!nomineeRank) {
      return NextResponse.json(
        { error: "Missing nominee rank" },
        { status: 400 }
      );
    }

    // Validate based on mode
    // In revision mode, additional context is optional - the LLM can revise based on existing statement alone
    const hasSourceInput = isCustomContextMode || (accomplishments && accomplishments.length > 0);
    if (!isRevisionMode && !hasSourceInput) {
      return NextResponse.json(
        { error: "Missing accomplishments or custom context" },
        { status: 400 }
      );
    }

    // Get user's LLM settings
    const { data: userSettings } = await supabase
      .from("user_llm_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const settings = userSettings as unknown as Partial<UserLLMSettings> || {};

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    const systemPrompt = buildAwardSystemPrompt(settings, nomineeRank);
    const modelProvider = getModelProvider(model, userKeys);

    // Fetch user-curated award examples
    const awardExamples = await fetchAwardExampleStatements(supabase, user.id);

    // Get sentences per category from settings or use defaults
    const sentencesPerCategory = settings.award_sentences_per_category || 
      DEFAULT_AWARD_SETTINGS.award_sentences_per_category;

    const results: { category: string; statementGroups: StatementGroup[] }[] = [];
    const levelGuidance = getAwardLevelGuidance(awardLevel);

    // Filter categories to generate
    const targetCategories = categoriesToGenerate && categoriesToGenerate.length > 0
      ? AWARD_1206_CATEGORIES.filter(c => categoriesToGenerate.includes(c.key))
      : AWARD_1206_CATEGORIES;

    // ============================================================
    // PURE REVISION MODE: Revise existing statement without additional context
    // ============================================================
    if (isRevisionMode && !hasSourceInput) {
      for (const category of targetCategories) {
        const pureRevisionPrompt = `REVISE the following AF Form 1206 narrative statement for the "${category.heading}" section.
Provide ${versionsPerStatement} different revised versions so the user can choose the best one.

EXISTING STATEMENT TO REVISE:
${existingStatement}

**REVISION INSTRUCTIONS:**
- Rewrite the statement to improve clarity, impact, and flow
- Enhance the language while preserving the core accomplishments and metrics
- Apply the rewrite intensity specified below to determine how much to change

**REWRITE INTENSITY:**
${intensityGuidance}

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}
${buildExamplesSection(awardExamples, category.key)}

**LINE COUNT & CHARACTER BUDGET - CRITICAL:**
Target: ${sentencesPerStatement} lines on AF Form 1206 (Times New Roman 12pt, 765.95px line width)
${sentencesPerStatement === 2 
  ? `CHARACTER TARGET: 220-260 characters total (~110-130 per line)
This is a 2-LINE statement. Write CONCISELY.`
  : `CHARACTER TARGET: 330-390 characters total (~110-130 per line)
This is a 3-LINE statement. You have more room for impacts and metrics.`}

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **CHARACTER COUNT IS KEY** - aim for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} total characters
3. Typically ${sentencesPerStatement} sentences, but character count matters more
4. Write in narrative-style (complete sentences/paragraphs)
5. MAXIMIZE density: Chain impacts, quantify aggressively, add mission context
6. Start with strong action verbs in active voice
7. Connect to ${awardLevel}-level mission impact

**PUNCTUATION - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- ONLY use commas (,) to connect clauses and chain impacts

Generate EXACTLY 1 statement group with ${versionsPerStatement} alternative revised versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.

Format as JSON array (EACH statement must start with "- "):
["- Version A", "- Version B", "- Version C"]`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: pureRevisionPrompt,
          });

          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const versions = JSON.parse(jsonMatch[0]) as string[];
            results.push({
              category: category.key,
              statementGroups: [{
                versions: versions.map(v => v.trim()),
                sourceAccomplishmentIds: [],
              }],
            });
          }
        } catch (error) {
          console.error(`Error generating pure revision for ${category.key}:`, error);
        }
      }

      return NextResponse.json({ statements: results });
    }

    // ============================================================
    // CUSTOM CONTEXT MODE: Generate from raw text input
    // ============================================================
    if (isCustomContextMode) {
      for (const category of targetCategories) {
        // Build revision-specific instructions if we have existing content
        const revisionInstructions = isRevisionMode ? `
EXISTING STATEMENT TO REVISE:
${existingStatement}

**SMART REVISION INSTRUCTIONS:**
- Revise the existing statement, incorporating any new context provided below
- Use your judgment to intelligently handle metrics:
  - If new metrics clearly add to existing ones (e.g., more volunteer hours), combine/sum them
  - If new metrics seem to replace or correct existing ones, use the new values
  - If the new context provides different accomplishments, weave them together cohesively
- Preserve the narrative quality and writing style of the existing statement
- Focus on making the statement more complete, accurate, and impactful

**REWRITE INTENSITY:**
${intensityGuidance}` : '';

        const customPrompt = `${isRevisionMode ? 'REVISE' : 'Generate'} HIGH-DENSITY AF Form 1206 narrative statement(s) for the "${category.heading}" section.
Provide ${versionsPerStatement} different versions so the user can choose the best one.

${isRevisionMode 
  ? 'REVISE the existing statement using the source text below, following the revision mode instructions carefully.'
  : 'TRANSFORM the following raw text/paragraph into polished, award-worthy narrative statement(s). Extract key accomplishments, quantify where possible, and enhance with mission impact.'}

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}
${revisionInstructions}

SOURCE TEXT/CONTEXT:
${customContext}

TRANSFORMATION INSTRUCTIONS:
- Extract and highlight key actions, achievements, and metrics from the text
- Infer reasonable mission impacts based on the context (readiness, cost savings, efficiency)
- Quantify aggressively: if approximate numbers are mentioned, use them; if none, infer reasonable metrics
- Connect accomplishments to larger organizational impact (flight → squadron → wing → AF)
- Use your military expertise to enhance with standard AF outcomes and terminology
${buildExamplesSection(awardExamples, category.key)}

**LINE COUNT & CHARACTER BUDGET - CRITICAL:**
Target: ${sentencesPerStatement} lines on AF Form 1206 (Times New Roman 12pt, 765.95px line width)
${sentencesPerStatement === 2 
  ? `CHARACTER TARGET: 220-260 characters total (~110-130 per line)
This is a 2-LINE statement. Write CONCISELY - use impactful, dense phrasing.`
  : `CHARACTER TARGET: 330-390 characters total (~110-130 per line)  
This is a 3-LINE statement. You have more room - add additional impacts and metrics.`}

The user will fine-tune character spacing after generation using our fitting tools, so focus on:
- Hitting the approximate character target range
- Dense, high-impact content with quantified results
- Strong action verbs and cascading impacts

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **CHARACTER COUNT IS KEY** - aim for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} total characters
3. Typically ${sentencesPerStatement} sentences, but character count matters more than sentence count
4. Write in narrative-style (complete sentences/paragraphs, not bullet format)
5. MAXIMIZE density: Chain impacts, quantify aggressively, add mission context
6. Start with strong action verbs in active voice
7. Connect to ${awardLevel}-level mission impact
8. Include the nominee's name or rank naturally when appropriate

**PUNCTUATION - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- ONLY use commas (,) to connect clauses and chain impacts

Generate EXACTLY 1 statement group with ${versionsPerStatement} alternative versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.

Format as JSON array (EACH statement must start with "- "):
["- Version A", "- Version B", "- Version C"]`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: customPrompt,
            temperature: 0.8,
            maxTokens: 2000,
          });

          // Parse JSON array from response
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const versions = JSON.parse(jsonMatch[0]) as string[];
            results.push({
              category: category.key,
              statementGroups: [{
                versions: versions.map(v => v.trim()),
                sourceAccomplishmentIds: [],
              }],
            });
          }
        } catch (parseError) {
          console.error(`Error generating custom context for ${category.key}:`, parseError);
        }
      }

      return NextResponse.json({ statements: results });
    }

    // ============================================================
    // ACCOMPLISHMENTS MODE: Generate from structured performance actions
    // ============================================================
    
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
    const accomplishmentsByCategory = (accomplishments || []).reduce(
      (acc, a) => {
        // Map MPA to 1206 category, default to leadership_job_performance
        const category1206 = mpaTo1206Category[a.mpa] || "leadership_job_performance";
        if (!acc[category1206]) acc[category1206] = [];
        acc[category1206].push(a);
        return acc;
      },
      {} as Record<string, AccomplishmentData[]>
    );

    // Generate statements for each 1206 category
    for (const category of targetCategories) {
      const categoryAccomplishments = accomplishmentsByCategory[category.key] || [];

      // Skip if no accomplishments for this category
      if (categoryAccomplishments.length === 0) {
        continue;
      }

      const categoryResults: StatementGroup[] = [];

      if (combineEntries) {
        // Build revision-specific instructions for accomplishments mode
        const accomplishmentsRevisionInstructions = isRevisionMode ? `
EXISTING STATEMENT TO REVISE:
${existingStatement}

**SMART REVISION INSTRUCTIONS:**
- Revise the existing statement, incorporating the accomplishments below
- Use your judgment to intelligently handle metrics:
  - If accomplishment metrics clearly add to existing ones (e.g., more volunteer hours), combine/sum them
  - If accomplishment metrics seem to replace or correct existing ones, use the new values
  - If the accomplishments provide different activities, weave them together cohesively
- Preserve the narrative quality and writing style of the existing statement
- Focus on making the statement more complete, accurate, and impactful

**REWRITE INTENSITY:**
${intensityGuidance}` : '';

        // COMBINE MODE: Merge all accomplishments into one powerful statement
        const combinedPrompt = `${isRevisionMode ? 'REVISE' : 'Generate'} ${statementsPerEntry} HIGH-DENSITY AF Form 1206 narrative statement(s) for the "${category.heading}" section.
For EACH statement, provide ${versionsPerStatement} different versions so the user can choose the best one.

${isRevisionMode 
  ? 'REVISE the existing statement using the accomplishments below, following the revision mode instructions carefully.'
  : 'IMPORTANT: COMBINE all the accomplishments below into cohesive, powerful statement(s). If there are similar metrics (like volunteer hours, training counts, etc.), SUM THEM UP and present the aggregated total.'}

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}
${accomplishmentsRevisionInstructions}

SOURCE ACCOMPLISHMENTS${isRevisionMode ? '/CONTEXT' : ' TO COMBINE'}:
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
${buildExamplesSection(awardExamples, category.key)}

**LINE COUNT & CHARACTER BUDGET - CRITICAL:**
Target: ${sentencesPerStatement} lines on AF Form 1206 (Times New Roman 12pt, 765.95px line width)
${sentencesPerStatement === 2 
  ? `CHARACTER TARGET: 220-260 characters total (~110-130 per line)
This is a 2-LINE statement. Write CONCISELY.`
  : `CHARACTER TARGET: 330-390 characters total (~110-130 per line)
This is a 3-LINE statement. You have more room for impacts and metrics.`}

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **CHARACTER COUNT IS KEY** - aim for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} total characters
3. Typically ${sentencesPerStatement} sentences, but character count matters more
4. Write in narrative-style (complete sentences/paragraphs, not bullet format)
5. MAXIMIZE density: Chain impacts, quantify aggressively, add mission context
6. Start with strong action verbs in active voice
7. Connect to ${awardLevel}-level mission impact

**PUNCTUATION - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- ONLY use commas (,) to connect clauses and chain impacts

Generate EXACTLY ${statementsPerEntry} statement group(s), each with ${versionsPerStatement} alternative versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.

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
        // Build revision-specific instructions for individual accomplishments mode
        const individualRevisionInstructions = isRevisionMode ? `
EXISTING STATEMENT TO REVISE:
${existingStatement}

**SMART REVISION INSTRUCTIONS:**
- Revise the existing statement, incorporating the accomplishment below
- Use your judgment to intelligently handle metrics:
  - If accomplishment metrics clearly add to existing ones (e.g., more volunteer hours), combine/sum them
  - If accomplishment metrics seem to replace or correct existing ones, use the new values
  - If the accomplishment provides a different activity, weave it together cohesively
- Preserve the narrative quality and writing style of the existing statement
- Focus on making the statement more complete, accurate, and impactful

**REWRITE INTENSITY:**
${intensityGuidance}` : '';

        for (const accomplishment of categoryAccomplishments) {
          const individualPrompt = `${isRevisionMode ? 'REVISE' : 'Generate'} ${statementsPerEntry} HIGH-DENSITY AF Form 1206 narrative statement(s) for the "${category.heading}" section.
For EACH statement, provide ${versionsPerStatement} different versions so the user can choose the best one.

${isRevisionMode 
  ? 'REVISE the existing statement using the accomplishment below, following the revision mode instructions carefully.'
  : ''}

NOMINEE: ${nomineeRank} ${nomineeName} | AFSC: ${nomineeAfsc || "N/A"}
AWARD LEVEL: ${awardLevel.toUpperCase()} | CATEGORY: ${awardCategory.toUpperCase()}
AWARD PERIOD: ${awardPeriod}

LEVEL-SPECIFIC GUIDANCE:
${levelGuidance}
${individualRevisionInstructions}

SOURCE ACCOMPLISHMENT:
Action: ${accomplishment.action_verb}
Details: ${accomplishment.details}
Impact: ${accomplishment.impact}
${accomplishment.metrics ? `Metrics: ${accomplishment.metrics}` : ""}
Date: ${new Date(accomplishment.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
${buildExamplesSection(awardExamples, category.key)}

**LINE COUNT & CHARACTER BUDGET - CRITICAL:**
Target: ${sentencesPerStatement} lines on AF Form 1206 (Times New Roman 12pt, 765.95px line width)
${sentencesPerStatement === 2 
  ? `CHARACTER TARGET: 220-260 characters total (~110-130 per line)
This is a 2-LINE statement. Write CONCISELY.`
  : `CHARACTER TARGET: 330-390 characters total (~110-130 per line)
This is a 3-LINE statement. You have more room for impacts and metrics.`}

CRITICAL 1206 REQUIREMENTS:
1. EVERY statement MUST start with "- " (dash space) followed by the text
2. **CHARACTER COUNT IS KEY** - aim for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} total characters
3. Typically ${sentencesPerStatement} sentences, but character count matters more
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
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.

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

