import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { AWARD_1206_CATEGORIES, DEFAULT_AWARD_SENTENCES } from "@/lib/constants";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { getModelProvider } from "@/lib/llm-provider";
import { handleLLMError, handleUsageLimitExceeded, handleBurstRateLimited } from "@/lib/llm-error-handler";
import type { Rank, UserLLMSettings, AwardLevel, AwardCategory, AwardSentencesPerCategory, WinLevel } from "@/types/database";
import { scanAccomplishmentsForLLM, scanTextForLLM } from "@/lib/sensitive-data-scanner";
import { checkAndTrackUsage } from "@/lib/usage-tracker";

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
  // Clarifying context from answered follow-up questions
  clarifyingContext?: string;
  // Previously saved answers for persistent context across sessions
  savedClarifyingAnswers?: { question: string; category: string; answer: string }[];
}

interface StatementGroup {
  versions: string[];
  sourceAccomplishmentIds: string[];
}

interface ClarifyingQuestionResponse {
  question: string;
  category: "impact" | "scope" | "leadership" | "recognition" | "metrics" | "general";
  hint?: string;
}

const AWARD_CLARIFYING_QUESTION_GUIDANCE = `
=== CLARIFYING QUESTIONS (MANDATORY - ALWAYS INCLUDE 2-3) ===
You MUST include 2-3 clarifying questions. Award statements are almost ALWAYS missing critical details. Analyze what the statement does NOT cover and ask about it.

**CRITICAL CHECK - If the statement doesn't explicitly address ANY of these, you MUST ask:**
1. Did this save TIME? How much? (hours, days, weeks saved)
2. Did this save MONEY or RESOURCES? How much? ($, equipment, manpower)
3. What was the SCOPE? (unit only, or group/wing/AF-wide impact?)
4. How many PEOPLE were affected, led, trained, or served?
5. Was there any RECOGNITION, selection, or competitive aspect?
6. What is the measurable BEFORE vs AFTER? (%, rate, score improvement)

**Question Categories:**
- **impact**: Time/money/resources saved, mission readiness improvement, what would have happened otherwise
- **scope**: Level of impact (flight → squadron → group → wing → AF), geographic reach, number of units affected
- **leadership**: Team size, mentorship numbers, scope beyond normal duties
- **recognition**: Hand-selected? Competitive selection? Awards or accolades received?
- **metrics**: Specific numbers, percentages, dollar amounts, time durations, personnel counts, comparison baselines

**Rules:**
- Ask about what is MISSING from the statement, not what is already there
- Focus on details that would make the biggest difference in statement impact
- Be specific in your questions (not generic "tell me more")

Include questions in a "clarifyingQuestions" field in your JSON response.
`;

// Default award system prompt
const DEFAULT_AWARD_PROMPT = `You are an expert Air Force writer specializing in award nominations on AF Form 1206 using the current **narrative-style format** (mandated since October 2022 per DAFI 36-2406 and award guidance).

CRITICAL RULES - NEVER VIOLATE THESE:
1. Every statement MUST begin with "- " (dash space) followed by a single, standalone sentence that flows naturally when read aloud.
2. NEVER use em-dashes (--). This is STRICTLY FORBIDDEN under any circumstances.
3. NEVER use semicolons (;). Use ONLY commas to connect clauses into flowing sentences.
4. NEVER use slash abbreviations (e.g., "w/", "w/o"). Write out words fully.
5. Every statement MUST contain: 1) a strong action AND 2) cascading impacts (immediate → unit → mission/AF-level).
6. AVOID the word "the" where possible - it wastes characters (e.g., "led the team" → "led 4-mbr team").
7. CONSISTENCY: Use either "&" OR "and" throughout a statement - NEVER mix them. Prefer "&" when saving space.

SENTENCE STRUCTURE (CRITICAL - THE #1 RULE):
Each statement MUST be a grammatically correct, complete sentence. Board members scan quickly - they need clear, punchy statements digestible in 2-3 seconds.

**GRAMMAR RULES:**
- Each statement is ONE grammatically correct sentence - NOT a list of comma-spliced fragments
- Use participial phrases (ending in -ing) to connect related actions naturally instead of stacking past-tense verbs separated by commas
- When listing 3+ results or impacts, use "&" or "and" before the FINAL item (e.g., "improved X, strengthened Y & advanced Z")
- Maximum 2-3 main clauses per statement - do NOT string together 4+ comma-separated verb phrases
- Place the BIGGEST IMPACT at the END for punch
- Read aloud test: If it sounds like a bullet list or run-on sentence, rewrite it

**BAD (comma-spliced fragments, no conjunctions - NOT a real sentence):**
"- Guided 20 peers through NCO course, totaling 900 hrs, cultivated leadership talent, fortified team cohesion, directly supported SOUTHCOM CC's development goals."

**GOOD (proper grammar, participial phrases, conjunction before final item):**
"- Directed 14-module NCO course, delivering 900 instructional hrs to 20 peers, enhancing leadership capabilities & fortifying sq readiness in direct support of SOUTHCOM CC's professional development goal."

**MORE EXAMPLES OF CORRECT STRUCTURE:**
"- Led 12-person team in overhauling deployment processing line, slashing preparation time by 40% & enabling rapid response for 150 personnel, directly contributing to wing's Excellent UCI rating."
"- Managed $2.3M equipment account, identifying & resolving 47 discrepancies, recovering $180K in assets & driving 99.8% accountability rate across the squadron."

ABBREVIATION POLICY (CRITICAL - DO NOT OVER-ABBREVIATE):
- Standard acronyms are ALLOWED: NCO, SNCO, SOUTHCOM, CC, MAJCOM, AF, DoD, etc.
- Common unit abbreviations are ALLOWED: sq, flt, wg, gp, mbr, Amn
- Time/measurement abbreviations are ALLOWED: hrs, mins, mo, yr
- NEVER create truncated or apostrophe abbreviations: "prof'l", "dvlpmt", "dev'd", "crse", "maint", "ldrshp", "trng"
- NEVER use slash abbreviations: "w/", "w/o", "b/c"
- When in doubt, SPELL OUT the full word (e.g., "professional" not "prof'l", "development" not "dvlpmt", "course" not "crse")
- ONLY abbreviate additional words if they appear in the user's abbreviation list below

BANNED VERBS - NEVER USE THESE (overused clichés):
- "Spearheaded" - the most overused verb in Air Force writing
- "Orchestrated" - overused
- "Synergized" - corporate buzzword, not military
- "Leveraged" - overused
- "Facilitated" - weak and overused
- "Utilized" - just say "used" or pick a stronger verb
- "Impacted" - vague and overused

VARIETY RULE: Each version you generate MUST start with a DIFFERENT action verb. Use varied, strong verbs:
Led, Directed, Managed, Commanded, Guided, Championed, Drove, Transformed, Pioneered, Modernized, Accelerated, Streamlined, Optimized, Enhanced, Elevated, Secured, Protected, Fortified, Trained, Mentored, Developed, Resolved, Eliminated, Delivered, Produced, Established, Coordinated, Integrated, Analyzed, Assessed, Negotiated, Saved, Recovered

BANNED FILLER CLOSERS (NEVER USE - these sound impressive but say nothing specific):
- "ensuring mission success" / "ensuring mission readiness"
- "bolstering global ops" / "bolstering global operations"
- "vital to force projection"
- "critical to national defense"
- "enhancing combat capability"
- "supporting warfighter needs"
- "key to operational excellence"
The ending MUST be SPECIFIC to THIS accomplishment's actual impact with real metrics, beneficiaries, or outcomes.
BAD ENDING: "...saving $50K, ensuring mission success." (generic filler)
GOOD ENDING: "...saving $50K annually, sustaining network access for 58K users." (specific, measurable)

CHARACTER UTILIZATION STRATEGY (CRITICAL FOR 1206 SPACE CONSTRAINTS):
The AF Form 1206 is constrained by physical line/space fitting in the PDF form.
- Write dense, high-impact statements with cascading effects and quantified results
- Use your military knowledge to infer/enhance reasonable outcomes (readiness rates, cost savings, inspection success)
- Minimize unnecessary whitespace while maintaining readability
- Quantify everything: numbers, percentages, dollar amounts, time saved, personnel affected

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}

WORD ABBREVIATIONS (ONLY abbreviate words from this list - spell out everything else):
{{abbreviations_list}}`;

// Default settings for award generation
const DEFAULT_AWARD_SETTINGS = {
  award_sentences_per_category: DEFAULT_AWARD_SENTENCES as unknown as AwardSentencesPerCategory,
  award_abbreviations: [],
  award_style_guidelines: "MAXIMIZE density for 1206 space constraints. Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Spell out words fully unless listed in the user's abbreviation list.",
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

function buildAwardSystemPrompt(
  settings: Partial<UserLLMSettings>,
  nomineeRank: Rank
): string {
  // Use award-specific verb progression, falling back to the API default (NOT the EPB verbs)
  const rankVerbs = settings.award_rank_verb_progression?.[nomineeRank] || 
    DEFAULT_AWARD_SETTINGS.rank_verb_progression[nomineeRank as keyof typeof DEFAULT_AWARD_SETTINGS.rank_verb_progression] || {
      primary: ["Led", "Managed"],
      secondary: ["Executed", "Coordinated"],
    };

  const abbreviations = settings.award_abbreviations || [];
  const abbreviationsList = abbreviations.length > 0
    ? abbreviations.map(a => `${a.word} → ${a.abbreviation}`).join(", ")
    : "No custom abbreviations set. Only use standard acronyms (NCO, SNCO, AF, DoD, CC, MAJCOM) and common unit/time abbreviations (sq, flt, wg, gp, hrs, mo, yr, Amn, mbr). Spell out all other words fully.";

  const rankVerbGuidance = `Primary verbs: ${rankVerbs.primary.join(", ")}\nSecondary verbs: ${rankVerbs.secondary.join(", ")}`;

  const styleGuidelines = settings.award_style_guidelines || DEFAULT_AWARD_SETTINGS.award_style_guidelines;

  const acronyms = settings.acronyms || [];
  const acronymsList = acronyms.length > 0
    ? acronyms.map(a => `${a.acronym} = ${a.definition}`).join(", ")
    : "Use standard AF acronyms as appropriate.";

  let prompt = settings.award_system_prompt || DEFAULT_AWARD_PROMPT;
  prompt = prompt.replace(/\{\{ratee_rank\}\}/g, nomineeRank);
  prompt = prompt.replace(/\{\{primary_verbs\}\}/g, rankVerbs.primary.join(", "));
  prompt = prompt.replace(/\{\{rank_verb_guidance\}\}/g, rankVerbGuidance);
  prompt = prompt.replace(/\{\{style_guidelines\}\}/g, styleGuidelines);
  prompt = prompt.replace(/\{\{abbreviations_list\}\}/g, abbreviationsList);
  prompt = prompt.replace(/\{\{acronyms_list\}\}/g, acronymsList);

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
  let modelId: string | undefined;
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
      clarifyingContext,
      savedClarifyingAnswers,
    } = body;

    const isCustomContextMode = !!customContext && customContext.trim().length > 0;
    const isRevisionMode = !!existingStatement && existingStatement.trim().length > 0;
    const hasClarifyingContext = !!clarifyingContext && clarifyingContext.trim().length > 0;
    // Always request questions UNLESS this is a regeneration triggered from answered questions
    const shouldRequestQuestions = !hasClarifyingContext;

    // Build persistent context from saved answers + new clarifying context
    const buildSavedAnswersContext = (): string => {
      const parts: string[] = [];
      if (savedClarifyingAnswers && savedClarifyingAnswers.length > 0) {
        const answered = savedClarifyingAnswers.filter(a => a.answer.trim().length > 0);
        if (answered.length > 0) {
          parts.push("=== PREVIOUSLY PROVIDED DETAILS (use these to enhance the statement) ===");
          answered.forEach(a => {
            parts.push(`Q: ${a.question}`);
            parts.push(`A: ${a.answer}`);
            parts.push("");
          });
        }
      }
      if (hasClarifyingContext) {
        parts.push(clarifyingContext!);
      }
      return parts.join("\n");
    };
    const savedContext = buildSavedAnswersContext();
    
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

    // Pre-transmission sensitive data scan — block before data reaches LLM providers
    if (accomplishments && accomplishments.length > 0) {
      const accScan = scanAccomplishmentsForLLM(accomplishments);
      if (accScan.blocked) {
        return NextResponse.json(
          { error: "Accomplishments contain sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating." },
          { status: 400 }
        );
      }
    }
    if (isCustomContextMode || isRevisionMode) {
      const textScan = scanTextForLLM(customContext, existingStatement);
      if (textScan.blocked) {
        return NextResponse.json(
          { error: "Context contains sensitive data (PII, CUI, or classification markings) that cannot be sent to AI providers. Please remove it before generating." },
          { status: 400 }
        );
      }
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
    modelId = model;

    // Usage tracking — enforce weekly limit for default-key users
    const usageCheck = await checkAndTrackUsage(user.id, "generate_award", modelId, userKeys);
    if (!usageCheck.allowed) {
      return usageCheck.rateLimited
        ? handleBurstRateLimited()
        : handleUsageLimitExceeded(usageCheck.weeklyUsed, usageCheck.weeklyLimit);
    }

    const effectiveModel = usageCheck.effectiveModel;
    const systemPrompt = buildAwardSystemPrompt(settings, nomineeRank);
    const modelProvider = getModelProvider(effectiveModel, userKeys);

    // Fetch user-curated award examples
    const awardExamples = await fetchAwardExampleStatements(supabase, user.id);

    // Get sentences per category from settings or use defaults
    const sentencesPerCategory = settings.award_sentences_per_category || 
      DEFAULT_AWARD_SETTINGS.award_sentences_per_category;

    const results: { category: string; statementGroups: StatementGroup[]; clarifyingQuestions?: ClarifyingQuestionResponse[] }[] = [];
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
${savedContext ? `\n${savedContext}\n` : ''}
**REVISION INSTRUCTIONS:**
- Rewrite the statement to improve clarity, impact, and flow
- Enhance the language while preserving the core accomplishments and metrics
- If user-provided details are included above, incorporate them to strengthen the statement
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
3. Each statement MUST be ONE grammatically correct sentence - NOT comma-spliced fragments
4. Use participial phrases (-ing verbs) to connect actions naturally, NOT chains of past-tense verbs separated by commas
5. When listing 3+ items, use "&" or "and" before the final item
6. Maximum 2-3 main clauses per statement
7. Start with strong action verbs in active voice
8. Connect to ${awardLevel}-level mission impact
9. Place the BIGGEST IMPACT at the END

**PUNCTUATION & GRAMMAR - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- Use commas and conjunctions ("&" or "and") for proper sentence flow
- Do NOT string together 4+ comma-separated verb phrases - that is a run-on sentence

**ABBREVIATION RULES - DO NOT OVER-ABBREVIATE:**
- NEVER create truncated abbreviations like "crse", "dvlpmt", "dev'd", "prof'l", "trng", "ldrshp", "maint"
- NEVER use slash abbreviations like "w/", "w/o", "b/c"
- SPELL OUT words fully: "course" not "crse", "development" not "dvlpmt", "professional" not "prof'l", "training" not "trng"
- Only standard acronyms (NCO, AF, CC, MAJCOM) and common short forms (sq, flt, hrs, Amn) are allowed

Generate EXACTLY 1 statement group with ${versionsPerStatement} alternative revised versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.
${shouldRequestQuestions ? `
${AWARD_CLARIFYING_QUESTION_GUIDANCE}

Format as JSON object (EACH statement must start with "- "):
{
  "statements": ["- Version A", "- Version B", "- Version C"],
  "clarifyingQuestions": [
    {"question": "Question text?", "category": "impact", "hint": "Brief hint"}
  ]
}` : `
Format as JSON array (EACH statement must start with "- "):
["- Version A", "- Version B", "- Version C"]`}`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: pureRevisionPrompt,
          });

          let versions: string[] = [];
          let clarifyingQuestions: ClarifyingQuestionResponse[] = [];

          const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
          if (jsonObjMatch) {
            const parsed = JSON.parse(jsonObjMatch[0]);
            versions = parsed.statements || [];
            if (Array.isArray(parsed.clarifyingQuestions)) {
              clarifyingQuestions = parsed.clarifyingQuestions.filter(
                (q: Record<string, unknown>) => typeof q.question === "string" && (q.question as string).length > 10
              );
            }
          } else {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              versions = JSON.parse(jsonMatch[0]) as string[];
            }
          }

          if (versions.length > 0) {
            results.push({
              category: category.key,
              statementGroups: [{
                versions: versions.map(v => v.trim()),
                sourceAccomplishmentIds: [],
              }],
              ...(clarifyingQuestions.length > 0 && { clarifyingQuestions }),
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
${savedContext ? `\n${savedContext}\n` : ''}
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
3. Each statement MUST be ONE grammatically correct sentence - NOT comma-spliced fragments
4. Use participial phrases (-ing verbs) to connect actions naturally, NOT chains of past-tense verbs separated by commas
5. When listing 3+ items, use "&" or "and" before the final item
6. Maximum 2-3 main clauses per statement
7. Start with strong action verbs in active voice
8. Connect to ${awardLevel}-level mission impact
9. Include the nominee's name or rank naturally when appropriate

**PUNCTUATION & GRAMMAR - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- Use commas and conjunctions ("&" or "and") for proper sentence flow
- Do NOT string together 4+ comma-separated verb phrases - that is a run-on sentence

**ABBREVIATION RULES - DO NOT OVER-ABBREVIATE:**
- NEVER create truncated abbreviations like "crse", "dvlpmt", "dev'd", "prof'l", "trng", "ldrshp", "maint"
- NEVER use slash abbreviations like "w/", "w/o", "b/c"
- SPELL OUT words fully: "course" not "crse", "development" not "dvlpmt", "professional" not "prof'l", "training" not "trng"
- Only standard acronyms (NCO, AF, CC, MAJCOM) and common short forms (sq, flt, hrs, Amn) are allowed

Generate EXACTLY 1 statement group with ${versionsPerStatement} alternative versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.
${shouldRequestQuestions ? `
${AWARD_CLARIFYING_QUESTION_GUIDANCE}

Format as JSON object (EACH statement must start with "- "):
{
  "statements": ["- Version A", "- Version B", "- Version C"],
  "clarifyingQuestions": [
    {"question": "Question text?", "category": "impact", "hint": "Brief hint"}
  ]
}` : `
Format as JSON array (EACH statement must start with "- "):
["- Version A", "- Version B", "- Version C"]`}`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: customPrompt,
            temperature: 0.8,
            maxOutputTokens: 2000,
          });

          let versions: string[] = [];
          let clarifyingQuestions: ClarifyingQuestionResponse[] = [];

          // Try to parse as JSON object with statements and clarifyingQuestions
          const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
          if (jsonObjMatch) {
            const parsed = JSON.parse(jsonObjMatch[0]);
            versions = parsed.statements || [];
            if (Array.isArray(parsed.clarifyingQuestions)) {
              clarifyingQuestions = parsed.clarifyingQuestions.filter(
                (q: Record<string, unknown>) => typeof q.question === "string" && (q.question as string).length > 10
              );
            }
          } else {
            // Fallback: parse as JSON array
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              versions = JSON.parse(jsonMatch[0]) as string[];
            }
          }

          if (versions.length > 0) {
            results.push({
              category: category.key,
              statementGroups: [{
                versions: versions.map(v => v.trim()),
                sourceAccomplishmentIds: [],
              }],
              ...(clarifyingQuestions.length > 0 && { clarifyingQuestions }),
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
    // Performance in Primary Duty: executing_mission, leading_people, managing_resources
    // Whole Airman Concept: improving_unit (education, volunteerism, community)
    const mpaTo1206Category: Record<string, string> = {
      executing_mission: "performance_in_primary_duty",
      leading_people: "performance_in_primary_duty",
      managing_resources: "performance_in_primary_duty",
      improving_unit: "whole_airman_concept",
      // Allow direct mapping if entries are already tagged with 1206 categories
      performance_in_primary_duty: "performance_in_primary_duty",
      whole_airman_concept: "whole_airman_concept",
      // Backwards compatibility for legacy entries
      leadership_job_performance: "performance_in_primary_duty",
      significant_self_improvement: "whole_airman_concept",
      base_community_involvement: "whole_airman_concept",
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
      let categoryClarifyingQuestions: ClarifyingQuestionResponse[] = [];

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
${savedContext ? `\n${savedContext}\n` : ''}
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
3. Each statement MUST be ONE grammatically correct sentence - NOT comma-spliced fragments
4. Use participial phrases (-ing verbs) to connect actions naturally, NOT chains of past-tense verbs separated by commas
5. When listing 3+ items, use "&" or "and" before the final item
6. Maximum 2-3 main clauses per statement
7. Start with strong action verbs in active voice
8. Connect to ${awardLevel}-level mission impact

**PUNCTUATION & GRAMMAR - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- Use commas and conjunctions ("&" or "and") for proper sentence flow
- Do NOT string together 4+ comma-separated verb phrases - that is a run-on sentence

**ABBREVIATION RULES - DO NOT OVER-ABBREVIATE:**
- NEVER create truncated abbreviations like "crse", "dvlpmt", "dev'd", "prof'l", "trng", "ldrshp", "maint"
- NEVER use slash abbreviations like "w/", "w/o", "b/c"
- SPELL OUT words fully: "course" not "crse", "development" not "dvlpmt", "professional" not "prof'l", "training" not "trng"
- Only standard acronyms (NCO, AF, CC, MAJCOM) and common short forms (sq, flt, hrs, Amn) are allowed

Generate EXACTLY ${statementsPerEntry} statement group(s), each with ${versionsPerStatement} alternative versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.
${shouldRequestQuestions ? `
${AWARD_CLARIFYING_QUESTION_GUIDANCE}

Format as JSON object (EACH statement must start with "- "):
{
  "statements": [
    ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"]
  ],
  "clarifyingQuestions": [
    {"question": "Question text?", "category": "impact", "hint": "Brief hint"}
  ]
}` : `
Format as JSON array of arrays (EACH statement must start with "- "):
[
  ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"],
  ...
]`}`;

        try {
          const { text } = await generateText({
            model: modelProvider,
            system: systemPrompt,
            prompt: combinedPrompt,
            temperature: 0.75,
            maxOutputTokens: 3000,
          });

          let clarifyingQuestions: ClarifyingQuestionResponse[] = [];

          // Try to parse as JSON object with statements and clarifyingQuestions
          const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
          if (jsonObjMatch) {
            const parsed = JSON.parse(jsonObjMatch[0]);
            const statementsData = parsed.statements || [];
            const parsedVersions = parseStatementResponse(JSON.stringify(statementsData), statementsPerEntry);
            for (const versions of parsedVersions) {
              categoryResults.push({
                versions,
                sourceAccomplishmentIds: categoryAccomplishments.map(a => a.id),
              });
            }
            if (Array.isArray(parsed.clarifyingQuestions)) {
              clarifyingQuestions = parsed.clarifyingQuestions.filter(
                (q: Record<string, unknown>) => typeof q.question === "string" && (q.question as string).length > 10
              );
            }
          } else {
            // Fallback: parse as array format
            const parsed = parseStatementResponse(text, statementsPerEntry);
            for (const versions of parsed) {
              categoryResults.push({
                versions,
                sourceAccomplishmentIds: categoryAccomplishments.map(a => a.id),
              });
            }
          }

          if (clarifyingQuestions.length > 0) {
            categoryClarifyingQuestions = clarifyingQuestions;
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
${savedContext ? `\n${savedContext}\n` : ''}
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
3. Each statement MUST be ONE grammatically correct sentence - NOT comma-spliced fragments
4. Use participial phrases (-ing verbs) to connect actions naturally, NOT chains of past-tense verbs separated by commas
5. When listing 3+ items, use "&" or "and" before the final item
6. Maximum 2-3 main clauses per statement
7. Start with strong action verbs in active voice
8. Connect to ${awardLevel}-level mission impact
9. Include the nominee's name or rank naturally when appropriate

**PUNCTUATION & GRAMMAR - EXTREMELY IMPORTANT:**
- NEVER use em-dashes (--) - this is STRICTLY FORBIDDEN
- NEVER use semicolons (;) or slashes (/)
- Use commas and conjunctions ("&" or "and") for proper sentence flow
- Do NOT string together 4+ comma-separated verb phrases - that is a run-on sentence

**ABBREVIATION RULES - DO NOT OVER-ABBREVIATE:**
- NEVER create truncated abbreviations like "crse", "dvlpmt", "dev'd", "prof'l", "trng", "ldrshp", "maint"
- NEVER use slash abbreviations like "w/", "w/o", "b/c"
- SPELL OUT words fully: "course" not "crse", "development" not "dvlpmt", "professional" not "prof'l", "training" not "trng"
- Only standard acronyms (NCO, AF, CC, MAJCOM) and common short forms (sq, flt, hrs, Amn) are allowed

Generate EXACTLY ${statementsPerEntry} statement group(s), each with ${versionsPerStatement} alternative versions.
AIM for ${sentencesPerStatement === 2 ? "220-260" : "330-390"} characters per statement.
${shouldRequestQuestions ? `
${AWARD_CLARIFYING_QUESTION_GUIDANCE}

Format as JSON object (EACH statement must start with "- "):
{
  "statements": [
    ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"]
  ],
  "clarifyingQuestions": [
    {"question": "Question text?", "category": "impact", "hint": "Brief hint"}
  ]
}` : `
Format as JSON array of arrays (EACH statement must start with "- "):
[
  ["- Version A of statement 1", "- Version B of statement 1", "- Version C of statement 1"],
  ...
]`}`;

          try {
            const { text } = await generateText({
              model: modelProvider,
              system: systemPrompt,
              prompt: individualPrompt,
              temperature: 0.75,
              maxOutputTokens: 2000,
            });

            let questionsParsed: ClarifyingQuestionResponse[] = [];

            // Try to parse as JSON object with statements and clarifyingQuestions
            const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
            if (jsonObjMatch) {
              const parsedObj = JSON.parse(jsonObjMatch[0]);
              const statementsData = parsedObj.statements || [];
              const parsedVersions = parseStatementResponse(JSON.stringify(statementsData), statementsPerEntry);
              for (const versions of parsedVersions) {
                categoryResults.push({
                  versions,
                  sourceAccomplishmentIds: [accomplishment.id],
                });
              }
              if (Array.isArray(parsedObj.clarifyingQuestions)) {
                questionsParsed = parsedObj.clarifyingQuestions.filter(
                  (q: Record<string, unknown>) => typeof q.question === "string" && (q.question as string).length > 10
                );
                if (questionsParsed.length > 0 && categoryClarifyingQuestions.length === 0) {
                  categoryClarifyingQuestions = questionsParsed;
                }
              }
            } else {
              // Fallback: parse as array format
              const parsed = parseStatementResponse(text, statementsPerEntry);
              for (const versions of parsed) {
                categoryResults.push({
                  versions,
                  sourceAccomplishmentIds: [accomplishment.id],
                });
              }
            }
          } catch (error) {
            console.error(`Error generating for ${category.key} entry:`, error);
          }
        }
      }

      if (categoryResults.length > 0) {
        results.push({
          category: category.key,
          statementGroups: categoryResults,
          ...(categoryClarifyingQuestions.length > 0 && { clarifyingQuestions: categoryClarifyingQuestions }),
        });
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
    return handleLLMError(error, "POST /api/generate-award", modelId);
  }
}

