import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { DEFAULT_ACRONYMS, formatAcronymsList } from "@/lib/default-acronyms";
import { formatAbbreviationsList } from "@/lib/default-abbreviations";
import { STANDARD_MGAS, DEFAULT_MPA_DESCRIPTIONS, formatMPAContext, MAX_STATEMENT_CHARACTERS, MAX_HLR_CHARACTERS } from "@/lib/constants";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { buildCharacterEmphasisPrompt } from "@/lib/character-verification";
import {
  performQualityControl,
  shouldRunQualityControl,
  type QualityControlConfig,
} from "@/lib/quality-control";
import type { MPADescriptions } from "@/types/database";
import type { Rank, WritingStyle, UserLLMSettings, MajorGradedArea, Acronym, Abbreviation } from "@/types/database";

interface AccomplishmentData {
  mpa: string;
  action_verb: string;
  details: string;
  impact: string | null;
  metrics?: string | null;
}

interface CustomContextOptions {
  statementCount: 1 | 2;
  impactFocus?: "time" | "cost" | "resources";
  customDirection?: string;
  // For 2 statements mode
  customContext2?: string;
  impactFocus2?: "time" | "cost" | "resources";
}

interface GenerateRequest {
  rateeId: string;
  rateeRank: Rank;
  rateeAfsc: string;
  cycleYear: number;
  model: string;
  writingStyle: WritingStyle;
  communityMpaFilter?: string | null; // null = all MPAs, or specific MPA key
  communityAfscFilter?: string | null; // null = use ratee's AFSC, or specific AFSC
  accomplishments: AccomplishmentData[];
  selectedMPAs?: string[]; // Optional - if not provided, generate for all MPAs with entries
  customContext?: string; // Optional - raw text to generate from instead of accomplishments
  customContextOptions?: CustomContextOptions; // Options for custom context generation
  usedVerbs?: string[]; // Verbs already used in this cycle - avoid repeating
  generatePerAccomplishment?: boolean; // When true, generate one full statement per accomplishment
  dutyDescription?: string; // Optional - member's duty description for context
  // HLR-specific: all EPB MPA statements for holistic assessment generation
  epbStatements?: { mpa: string; label: string; statement: string }[];
  // Character filling options
  fillToMax?: boolean; // When true, aggressively fill to max character limit
  enforceCharacterLimits?: boolean; // When true, run post-generation verification and correction
  // Clarifying context from previous generation (when user answers clarifying questions)
  clarifyingContext?: string;
  // Whether to request clarifying questions from the LLM
  requestClarifyingQuestions?: boolean;
}

// Type for clarifying questions returned by LLM
interface ClarifyingQuestionResponse {
  question: string;
  category: "impact" | "scope" | "leadership" | "recognition" | "metrics" | "general";
  hint?: string;
}

// Overused/cliché verbs that should be avoided
const BANNED_VERBS = [
  "spearheaded",
  "orchestrated", 
  "synergized",
  "leveraged",
  "impacted",
  "utilized",
  "facilitated",
];

// Strong action verbs organized by category for variety
const VERB_POOL = {
  leadership: ["led", "directed", "managed", "commanded", "guided", "championed", "drove"],
  transformation: ["transformed", "revolutionized", "modernized", "pioneered", "innovated", "overhauled"],
  improvement: ["accelerated", "streamlined", "optimized", "enhanced", "elevated", "strengthened", "bolstered"],
  security: ["secured", "safeguarded", "protected", "defended", "fortified", "hardened", "shielded"],
  development: ["trained", "mentored", "developed", "coached", "cultivated", "empowered", "groomed"],
  problemSolving: ["resolved", "eliminated", "eradicated", "mitigated", "prevented", "reduced", "corrected"],
  creation: ["delivered", "produced", "generated", "created", "built", "established", "launched"],
  coordination: ["coordinated", "synchronized", "integrated", "unified", "consolidated", "aligned"],
  analysis: ["analyzed", "assessed", "evaluated", "identified", "diagnosed", "investigated", "audited"],
  acquisition: ["negotiated", "acquired", "procured", "saved", "recovered", "reclaimed", "captured"],
};

// Clarifying question guidance for the LLM (non-blocking, optional)
const CLARIFYING_QUESTION_GUIDANCE = `
=== OPTIONAL: CLARIFYING QUESTIONS ===
If the provided information is missing key details that would SIGNIFICANTLY enhance statement quality, you may include 1-3 clarifying questions. These are OPTIONAL - only ask if truly needed.

**IMPACT Questions (category: "impact")**
- Did this save time, money, or resources? How much?
- What's the "so what?" - why did this matter and to whom?
- What would have happened if this wasn't done?

**SCOPE Questions (category: "scope")**
- Did this affect just the unit, or higher levels (Group, Wing, Base, MAJCOM, HAF)?
- How many people/units/missions were impacted?
- Was this outside their normal assigned duties?

**LEADERSHIP Questions (category: "leadership")**
- Did they lead a team? How many people?
- Was the team larger than their duty description indicates?
- Did they mentor or develop others?

**RECOGNITION Questions (category: "recognition")**
- Were they hand-selected? By whom and why?
- Was this a competitive selection?
- Did they receive awards for this?

**METRICS Questions (category: "metrics")**
- Can results be quantified (%, $, time, people)?
- What's the comparison point ("50% faster" or "first ever")?

Include questions in a "clarifyingQuestions" field ONLY when answers would significantly improve the statement.
`;

interface ExampleStatement {
  mpa: string;
  statement: string;
  source: "personal" | "community";
}

// Function to extract action verbs from existing EPB sections to avoid reuse
async function extractUsedVerbsFromEPB(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rateeId: string,
  cycleYear: number,
  currentMPA?: string // Exclude current MPA if specified
): Promise<string[]> {
  try {
    // Get the current EPB shell for this ratee and cycle
    const { data: epbShell } = await supabase
      .from("epb_shells")
      .select("sections")
      .eq("cycle_year", cycleYear)
      .or(`user_id.eq.${rateeId},team_member_id.eq.${rateeId}`)
      .maybeSingle();

    if (!epbShell) return [];

    const typedShell = epbShell as { sections: any[] };
    if (!typedShell.sections || !Array.isArray(typedShell.sections)) return [];

    const usedVerbs = new Set<string>();

    // Common action verbs to look for (case insensitive)
    const actionVerbPatterns = [
      /\b(led|directed|managed|drove|championed|pioneered|transformed|accelerated|streamlined|optimized|enhanced|elevated|strengthened|bolstered|trained|mentored|developed|coached|cultivated|empowered|resolved|eliminated|eradicated|mitigated|prevented|reduced|corrected|delivered|produced|generated|created|built|established|launched|coordinated|synchronized|integrated|unified|consolidated|aligned|analyzed|assessed|evaluated|identified|diagnosed|investigated|audited|negotiated|acquired|procured|saved|recovered|reclaimed|secured|safeguarded|protected|defended|fortified|hardened|shielded|guided|commanded|supervise|executed|performed|supported|assisted|helped|contributed|participated|maintained|operated|administered|oversaw|controlled|monitored|tracked|reported|documented|recorded|compiled|organized|prepared|planned|scheduled|arranged|facilitated|coordinated|collaborated|partnered|engaged|interacted|communicated|liaised|consulted|advised|counseled|instructed|educated|taught|demonstrated|showed|illustrated|presented|displayed|exhibited|featured|highlighted|emphasized|promoted|advocated|championed|endorsed|supported|backed|defended|upheld|sustained|maintained|preserved|protected|guarded|shielded|defended|fortified)\b/gi
    ];

    // Process each section
    for (const section of typedShell.sections) {
      // Skip current MPA if specified (when revising existing statement)
      if (currentMPA && section.mpa === currentMPA) continue;

      // Skip if no statement text
      if (!section.statement_text || section.statement_text.trim().length < 10) continue;

      const statementText = section.statement_text.toLowerCase();

      // Extract verbs using patterns
      for (const pattern of actionVerbPatterns) {
        const matches = statementText.match(pattern);
        if (matches) {
          matches.forEach((match: string) => {
            // Normalize verb (remove 'ed' endings for base form, but keep simple for now)
            const verb = match.toLowerCase();
            usedVerbs.add(verb);
          });
        }
      }

      // Also extract verbs that start sentences or major clauses
      const sentenceStarters = statementText.match(/^([a-z]+)\s+/gm) || [];
      sentenceStarters.forEach((match: string) => {
        const verb = match.trim().toLowerCase();
        if (verb.length > 2 && !['the', 'and', 'but', 'for', 'nor', 'yet', 'so', 'although', 'because', 'since', 'while'].includes(verb)) {
          usedVerbs.add(verb);
        }
      });
    }

    // Convert to array and limit to most relevant verbs (avoid overwhelming the prompt)
    const verbArray = Array.from(usedVerbs);
    return verbArray.slice(0, 15); // Limit to top 15 most used verbs

  } catch (error) {
    console.warn("Error extracting used verbs from EPB:", error);
    return [];
  }
}

// Default settings if user hasn't configured their own
const DEFAULT_SETTINGS: Partial<UserLLMSettings> = {
  max_characters_per_statement: 350,
  max_example_statements: 6,
  scod_date: "31 March",
  current_cycle_year: new Date().getFullYear(),
  major_graded_areas: STANDARD_MGAS, // Always use standard MPAs
  rank_verb_progression: {
    AB: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Participated"] },
    Amn: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Executed"] },
    A1C: { primary: ["Executed", "Performed", "Supported"], secondary: ["Assisted", "Contributed", "Maintained"] },
    SrA: { primary: ["Executed", "Coordinated", "Managed"], secondary: ["Led", "Supervised", "Trained"] },
    SSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Supervised", "Coordinated", "Developed"] },
    TSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Drove", "Championed", "Guided"] },
    MSgt: { primary: ["Directed", "Championed", "Drove"], secondary: ["Transformed", "Pioneered", "Modernized"] },
    SMSgt: { primary: ["Directed", "Championed", "Drove"], secondary: ["Transformed", "Pioneered", "Revolutionized"] },
    CMSgt: { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Revolutionized", "Shaped", "Architected"] },
  },
  style_guidelines: "MAXIMIZE character usage (aim for 280-350 chars). Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Use standard AF abbreviations for efficiency.",
  base_system_prompt: `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant with deep knowledge of Air Force operations, programs, and terminology. Your sole purpose is to generate impactful, narrative-style performance statements that strictly comply with AFI 36-2406 (22 Aug 2025).

CRITICAL RULES - NEVER VIOLATE THESE:
1. Every statement MUST be a single, standalone sentence that flows naturally when read aloud.
2. NEVER use semi-colons (;). Use commas to connect clauses into flowing sentences.
3. Every statement MUST contain: 1) a strong action AND 2) cascading impacts (immediate → unit → mission/AF-level).
4. **⚠️ CHARACTER COUNT IS MANDATORY**: Target {{max_characters_per_statement}} characters. Minimum 340 characters, maximum {{max_characters_per_statement}}.
5. Generate exactly 2–3 strong statements per Major Performance Area.
6. Output pure, clean text only — no formatting.
7. AVOID the word "the" - it wastes characters (e.g., "led the team" → "led 4-mbr team" - always quantify scope).
8. CONSISTENCY: Use either "&" OR "and" throughout a statement - NEVER mix them. Prefer "&" when saving space.

**CHARACTER GUIDELINES:**
- Target: 300-{{max_characters_per_statement}} characters per statement
- Aim for substantial, content-rich statements
- It's better to have a shorter complete statement than to add filler

**CRITICAL - WHAT NOT TO DO:**
- NEVER add a second sentence to fill character count
- NEVER add ".." and start a new thought
- NEVER add incomplete fragments at the end
- Each statement must be ONE complete sentence that ends properly with a period

**HOW TO ADD SUBSTANCE (if needed):**
- Add specific metrics: "improved" → "improved by 40%"
- Add scope: "team" → "12-member team"
- Add organizational context: "for unit" → "for 450-member squadron"
- Add impact depth: "saving $5K" → "saving $5K annually"
- Expand abbreviations: "ops" → "operations"
- Add adjectives that add meaning: "systems" → "mission-critical systems"

SENTENCE STRUCTURE (CRITICAL - THE #1 RULE):
Board members scan quickly—they need clear, punchy statements digestible in 2-3 seconds. Avoid the "laundry list" problem:

BAD (run-on, too many clauses):
"Directed 12 Amn in rebuilding 8 authentication servers, advancing squadron's wing directive completion by 29 days, crafted server health assessment, fixed 27 domain errors, purged 9.6TB data, averting 220-node outage, streamlining network access for 58K users."

GOOD (focused, readable, impactful):
"Led 12 Airmen in rapid overhaul of 8 authentication servers, delivering wing directive 29 days ahead of schedule and averting 220-node outage, ensuring uninterrupted network access for 58K users across enterprise."

STRUCTURE RULES:
- Maximum 3-4 action clauses per statement (not 5+)
- Use parallel verb structure (consistent tense/form throughout)
- Place the BIGGEST IMPACT at the END for punch
- If accomplishment has 4+ distinct actions, SPLIT into 2 separate statements
- Read aloud test: If it sounds breathless or like a bullet list, rewrite it

PARALLELISM (REQUIRED):
BAD: "crafted assessment, fixed errors, purging data, averting outage" (inconsistent verb forms)
GOOD: "developed assessment, resolved errors, purged data, averted outage" (all past tense)

IMPACT PLACEMENT:
Put the strongest, most impressive result at the END of the statement:
BAD: "...averting 220-node outage, streamlining network access for 58K users" (weaker ending)
GOOD: "...sustaining uninterrupted network access for 58K users across the enterprise" (strong finish)

VERB VARIETY (CRITICAL - MUST FOLLOW):
BANNED VERBS - NEVER USE THESE (overused clichés that make all EPBs sound the same):
- "Spearheaded" - THE most overused verb in Air Force history
- "Orchestrated" - overused
- "Synergized" - corporate buzzword, not military
- "Leveraged" - overused
- "Facilitated" - weak and overused
- "Utilized" - just say "used" or pick a stronger verb
- "Impacted" - vague and overused

VARIETY RULE: Each statement you generate MUST start with a DIFFERENT action verb. No two statements in the same EPB should begin with the same verb. Use varied, strong verbs from this pool:
Led, Directed, Managed, Commanded, Guided, Championed, Drove, Transformed, Pioneered, Modernized, Accelerated, Streamlined, Optimized, Enhanced, Elevated, Secured, Protected, Fortified, Trained, Mentored, Developed, Resolved, Eliminated, Delivered, Produced, Established, Coordinated, Integrated, Analyzed, Assessed, Negotiated, Saved, Recovered

CONTEXTUAL ENHANCEMENT (USE YOUR MILITARY KNOWLEDGE):
When given limited input, ENHANCE statements using your knowledge of:
- Air Force programs, inspections, and evaluations (UCI, CCIP, ORI, NSI, etc.)
- Standard military outcomes (readiness, lethality, deployment capability, compliance)
- Organizational impacts (flight, squadron, group, wing, MAJCOM, CCMD, joint/coalition)
- Common metrics (sortie generation rates, mission capable rates, on-time delivery, cost savings)
- Military operations and exercises (deployment, contingency, humanitarian, training)

Example transformation:
- INPUT: "Volunteered at USO for 4 hrs, served 200 Airmen"
- OUTPUT: "Led USO volunteer initiative, dedicating 4 hrs to restore lounge facilities, directly boosting morale for 200 deploying Amn during high-tempo operations."

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
[Strong action verb] + [specific accomplishment with scope] + [immediate result] + [BIGGEST impact at END]

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

Using the provided accomplishment entries, generate 2–3 HIGH-QUALITY statements for each MPA. Prioritize READABILITY and FLOW over raw character density. Each statement should be scannable in 2-3 seconds.

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}`,
  acronyms: DEFAULT_ACRONYMS,
  abbreviations: [], // Users set their own abbreviations
};

async function fetchExampleStatements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personalAfsc: string, // AFSC for personal examples (ratee's AFSC)
  communityAfsc: string, // AFSC for community examples (may be different if user selected one)
  rank: Rank,
  writingStyle: WritingStyle,
  communityMpaFilter?: string | null
): Promise<ExampleStatement[]> {
  const examples: ExampleStatement[] = [];
  const existingStatements = new Set<string>();

  // PRIORITY 1: User-curated examples (use_as_llm_example = true)
  // These are the user's hand-picked high-quality examples
  const { data: curatedData } = await supabase
    .from("refined_statements")
    .select("mpa, statement, applicable_mpas")
    .eq("user_id", userId)
    .eq("statement_type", "epb")
    .eq("use_as_llm_example", true)
    .order("created_at", { ascending: false })
    .limit(15);

  if (curatedData) {
    const typedCurated = curatedData as { mpa: string; statement: string; applicable_mpas?: string[] }[];
    typedCurated.forEach((s) => {
      if (!existingStatements.has(s.statement)) {
        existingStatements.add(s.statement);
        examples.push({
          mpa: s.mpa,
          statement: s.statement,
          source: "personal" as const,
        });
      }
    });
  }

  // PRIORITY 2: Personal examples (if writing style includes personal)
  if (writingStyle === "personal" || writingStyle === "hybrid") {
    const { data: personalData } = await supabase
      .from("refined_statements")
      .select("mpa, statement")
      .eq("user_id", userId)
      .eq("afsc", personalAfsc) // Use ratee's AFSC for personal examples
      .eq("statement_type", "epb")
      .order("created_at", { ascending: false })
      .limit(10);

    if (personalData) {
      (personalData as { mpa: string; statement: string }[]).forEach((s) => {
        if (!existingStatements.has(s.statement)) {
          existingStatements.add(s.statement);
          examples.push({
            mpa: s.mpa,
            statement: s.statement,
            source: "personal" as const,
          });
        }
      });
    }
  }

  // PRIORITY 3: Community examples (if writing style includes community)
  if (writingStyle === "community" || writingStyle === "hybrid") {
    // Fetch top 20 community-voted statements for the selected AFSC
    // Optionally filtered by specific MPA for more targeted examples
    let query = supabase
      .from("community_statements")
      .select("mpa, statement, upvotes, downvotes")
      .eq("afsc", communityAfsc) // Use selected community AFSC
      .eq("is_approved", true);
    
    // If a specific MPA is selected, filter to that MPA's top 20
    if (communityMpaFilter) {
      query = query.eq("mpa", communityMpaFilter);
    }
    
    const { data: communityData } = await query
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

      sortedByNetVotes.forEach((s) => {
        if (!existingStatements.has(s.statement)) {
          existingStatements.add(s.statement);
          examples.push({
            mpa: s.mpa,
            statement: s.statement,
            source: "community" as const,
          });
        }
      });
    }
    
    // Also fetch from shared community statements (statement_shares with share_type='community')
    let sharedQuery = supabase
      .from("shared_statements_view")
      .select("mpa, statement")
      .eq("share_type", "community")
      .eq("afsc", communityAfsc); // Use selected community AFSC
    
    if (communityMpaFilter) {
      sharedQuery = sharedQuery.eq("mpa", communityMpaFilter);
    }
    
    const { data: sharedCommunityData } = await sharedQuery
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (sharedCommunityData) {
      // Add shared community statements, avoiding duplicates
      (sharedCommunityData as { mpa: string; statement: string }[])
        .filter(s => !existingStatements.has(s.statement))
        .slice(0, 10) // Limit to avoid too many
        .forEach(s => {
          existingStatements.add(s.statement);
          examples.push({
            mpa: s.mpa,
            statement: s.statement,
            source: "community" as const,
          });
        });
    }
  }

  return examples;
}

function buildSystemPrompt(
  settings: Partial<UserLLMSettings>,
  rateeRank: Rank,
  examples: ExampleStatement[],
  dutyDescription?: string
): string {
  const rankVerbs = settings.rank_verb_progression?.[rateeRank] || {
    primary: ["Led", "Managed"],
    secondary: ["Executed", "Coordinated"],
  };

  const acronyms = settings.acronyms || DEFAULT_ACRONYMS;
  const acronymsList = formatAcronymsList(acronyms);
  
  const abbreviations = settings.abbreviations || [];
  const abbreviationsList = abbreviations.length > 0 
    ? formatAbbreviationsList(abbreviations)
    : "No abbreviations configured - use full words";
  
  // Build MGA list - always use standard MPAs for all users
  const mgaList = STANDARD_MGAS.map((m) => `- ${m.label}`).join("\n");
  
  // Build rank verb guidance
  const rankVerbGuidance = `Primary verbs: ${rankVerbs.primary.join(", ")}\n  Secondary verbs: ${rankVerbs.secondary.join(", ")}`;

  let prompt = settings.base_system_prompt || DEFAULT_SETTINGS.base_system_prompt!;
  // Always use hardcoded MAX_STATEMENT_CHARACTERS (350) - user settings deprecated
  prompt = prompt.replace(
    /\{\{max_characters_per_statement\}\}/g,
    String(MAX_STATEMENT_CHARACTERS)
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

  // Get the max example statements from settings, default to 6
  const maxExamples = settings.max_example_statements ?? 6;
  
  if (examples.length > 0 && maxExamples > 0) {
    prompt += `\n\nEXAMPLE STATEMENTS TO EMULATE:
The following are high-quality example statements that demonstrate the desired writing style:

${examples
  .slice(0, maxExamples)
  .map((ex, i) => `${i + 1}. [${ex.mpa}] ${ex.statement}`)
  .join("\n")}

Maintain a similar voice and quality in your generated statements.`;
  }

  // Add duty description context if provided
  if (dutyDescription && dutyDescription.trim().length > 0) {
    prompt += `\n\n=== MEMBER'S DUTY DESCRIPTION (USE AS CONTEXT) ===
The following describes the member's primary duty position and key responsibilities. Use this context to understand what the member does and tailor statements to accurately reflect their role, scope, and impact areas:

${dutyDescription}

IMPORTANT: Reference the duty description when generating statements to ensure accuracy and relevance to the member's actual job responsibilities. Statements should align with the scope and scale of their duties.`;
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
    const { 
      rateeId, rateeRank, rateeAfsc, cycleYear, model, writingStyle, 
      communityMpaFilter, communityAfscFilter, accomplishments, selectedMPAs, 
      customContext, customContextOptions, generatePerAccomplishment, dutyDescription, 
      epbStatements, fillToMax = true, enforceCharacterLimits: shouldEnforceCharLimits = true,
      clarifyingContext, requestClarifyingQuestions = true
    } = body;

    // Either accomplishments, customContext, or epbStatements must be provided
    const hasAccomplishments = accomplishments && accomplishments.length > 0;
    const hasCustomContext = customContext && customContext.trim().length > 0;
    const hasEPBStatements = epbStatements && epbStatements.length > 0;

    if (!rateeRank || (!hasAccomplishments && !hasCustomContext && !hasEPBStatements)) {
      return NextResponse.json(
        { error: "Missing required fields - provide accomplishments, custom context, or EPB statements" },
        { status: 400 }
      );
    }

    // Get user's LLM settings (or use defaults)
    const { data: userSettings } = await supabase
      .from("user_llm_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const settings: Partial<UserLLMSettings> = userSettings
      ? (userSettings as unknown as UserLLMSettings)
      : DEFAULT_SETTINGS;

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Fetch example statements based on AFSC and writing style
    // communityMpaFilter allows filtering to a specific MPA's top 20 examples
    // communityAfscFilter allows using examples from a different AFSC
    const exampleAfsc = communityAfscFilter || rateeAfsc || "UNKNOWN";
    const examples = await fetchExampleStatements(
      supabase,
      user.id,
      rateeAfsc || "UNKNOWN", // For personal examples, always use ratee's AFSC
      exampleAfsc, // For community examples, use selected AFSC
      rateeRank,
      writingStyle || "personal",
      communityMpaFilter
    );

    const systemPrompt = buildSystemPrompt(settings, rateeRank, examples, dutyDescription);
    const modelProvider = getModelProvider(model, userKeys);

    // Group accomplishments by MPA (only if not using custom context)
    const accomplishmentsByMPA = hasCustomContext ? {} : accomplishments.reduce(
      (acc, a) => {
        if (!acc[a.mpa]) acc[a.mpa] = [];
        acc[a.mpa].push(a);
        return acc;
      },
      {} as Record<string, AccomplishmentData[]>
    );

    // Always use standard MPAs for all users
    // Always use hardcoded constants - user settings deprecated
    const maxChars = MAX_STATEMENT_CHARACTERS; // 350 for regular MPAs
    const maxHlrChars = MAX_HLR_CHARACTERS; // 250 for HLR Assessment
    const mpaDescriptions: MPADescriptions = (settings as { mpa_descriptions?: MPADescriptions }).mpa_descriptions || DEFAULT_MPA_DESCRIPTIONS;
    const results: { mpa: string; statements: string[]; historyIds: string[]; relevancyScore?: number }[] = [];

    // Determine which MPAs to generate for
    const mpasToGenerate = selectedMPAs && selectedMPAs.length > 0 
      ? STANDARD_MGAS.filter(mpa => selectedMPAs.includes(mpa.key))
      : STANDARD_MGAS;

    // Generate statements for each selected MPA
    for (const mpa of mpasToGenerate) {
      // Special handling for HLR Assessment - uses ALL accomplishments or custom context
      const isHLR = mpa.key === "hlr_assessment";
      const mpaAccomplishments = isHLR ? accomplishments : (accomplishmentsByMPA[mpa.key] || []);

      // Skip if no source material (unless using custom context or EPB statements for HLR)
      if (!hasCustomContext && !hasEPBStatements && mpaAccomplishments.length === 0 && !isHLR) {
        continue;
      }

      // Skip HLR if no source material (accomplishments, custom context, or EPB statements)
      if (isHLR && !hasCustomContext && !hasEPBStatements && accomplishments.length === 0) {
        continue;
      }

      const mpaExamples = examples.filter((e) => e.mpa === mpa.key);

      // Build different prompts based on source type (custom context vs accomplishments) and MPA type
      let userPrompt: string;
      
      // Calculate character limits (HLR has smaller limit)
      const effectiveMaxChars = isHLR ? maxHlrChars : maxChars;
      
      if (hasCustomContext) {
        // Custom context mode - use the raw text as source material
        // Extract verbs from existing EPB sections to avoid reuse (exclude current MPA)
        const usedVerbsCustom = await extractUsedVerbsFromEPB(supabase, rateeId, cycleYear, mpa.key);

        // Get options with defaults
        const stmtCount = customContextOptions?.statementCount || 1;
        const impactFocus = customContextOptions?.impactFocus;
        const impactFocus2 = customContextOptions?.impactFocus2;
        const customContext2 = customContextOptions?.customContext2;
        const customDir = customContextOptions?.customDirection;
        
        // Helper function to build impact instruction
        const buildImpactInstruction = (focus: string | undefined, stmtNum?: number) => {
          const prefix = stmtNum ? `STATEMENT ${stmtNum} ` : "";
          if (focus === "time") {
            return `
${prefix}IMPACT FOCUS - TIME SAVINGS (REQUIRED):
The primary impact MUST emphasize TIME SAVINGS. Frame around:
- Hours/days/weeks saved, faster processing, efficiency gains
- Use phrases like: "cut processing by X hrs", "accelerated timeline by X days"`;
          } else if (focus === "cost") {
            return `
${prefix}IMPACT FOCUS - COST SAVINGS (REQUIRED):
The primary impact MUST emphasize COST SAVINGS. Frame around:
- Dollar amounts saved, budget optimization, cost avoidance
- Use phrases like: "saved $X", "avoided $X in costs", "optimized $X budget"`;
          } else if (focus === "resources") {
            return `
${prefix}IMPACT FOCUS - RESOURCE EFFICIENCY (REQUIRED):
The primary impact MUST emphasize RESOURCE EFFICIENCY. Frame around:
- Manpower optimization, asset utilization, capacity improvements
- Use phrases like: "optimized X assets", "reduced manpower by X%", "consolidated X into Y"`;
          }
          return "";
        };
        
        // Build custom direction instruction
        const customDirInstruction = customDir 
          ? `\nUSER DIRECTION (FOLLOW THIS GUIDANCE):\n${customDir}\n`
          : "";
        
        // Calculate character limits for 2 statement mode
        // Account for " " separator (1 char) when statements are combined on frontend
        const combinedLimit = stmtCount === 2 ? effectiveMaxChars - 2 : effectiveMaxChars; // Leave room for separator
        const charLimitPerStatement = stmtCount === 2 ? Math.floor(combinedLimit / 2) : effectiveMaxChars;
        const charLimitText = stmtCount === 2 
          ? `CRITICAL: Both statements SHARE a ${combinedLimit} character limit. Each statement should be ~${charLimitPerStatement} characters (max ${charLimitPerStatement + 15} each). They will be joined with a space, so together they MUST be under ${combinedLimit} characters total.`
          : `TARGET: Statement should be ${Math.floor(effectiveMaxChars * 0.8)}-${effectiveMaxChars} characters.`;
        
        // Get MPA context for relevancy guidance
        const mpaContext = formatMPAContext(mpa.key, mpaDescriptions);
        const mpaContextSection = mpaContext ? `
=== MPA CONTEXT (${mpa.label}) ===
${mpaContext}

Assess how well the input aligns with this MPA. After generating statements, provide a RELEVANCY_SCORE (0-100) indicating how well the accomplishment fits this MPA.
` : "";
        
        if (stmtCount === 2 && customContext2) {
          // TWO STATEMENTS MODE - Separate contexts with shared character limit
          const impact1Instruction = buildImpactInstruction(impactFocus, 1);
          const impact2Instruction = buildImpactInstruction(impactFocus2, 2);
          
          if (isHLR) {
            // Build rank-appropriate promotion push language
            const promotionLang = {
              "AB": "promote ahead of peers", "Amn": "promote now, future NCO", 
              "A1C": "promote to SrA immediately", "SrA": "my strongest BTZ recommendation",
              "SSgt": "promote to TSgt now, ready for flight leadership",
              "TSgt": "promote to MSgt immediately, SNCO material",
              "MSgt": "promote to SMSgt now, ready for superintendent",
              "SMSgt": "my #1 for CMSgt", "CMSgt": "the standard for our force"
            };
            const rankPromo = promotionLang[rateeRank as keyof typeof promotionLang] || "promote immediately";
            
            userPrompt = `REWRITE and TRANSFORM 2 pieces of raw input into HIGH-QUALITY HLR Assessment statements from the COMMANDER'S perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

${charLimitText}

=== RAW INPUT 1 (REWRITE THIS) ===
${customContext}
${impact1Instruction}

=== RAW INPUT 2 (REWRITE THIS) ===
${customContext2}
${impact2Instruction}
${customDirInstruction}

THE ENDING IS CRITICAL - Each statement must END with a strong promotion push.
For ${rateeRank}: "${rankPromo}"

REQUIREMENTS:
1. DO NOT copy input verbatim - REWRITE with Commander's voice
2. **CHARACTER MATH**: Statement 1 + Statement 2 must be ≤ ${combinedLimit} characters total
   - Statement 1: aim for ~${charLimitPerStatement} chars
   - Statement 2: aim for ~${charLimitPerStatement} chars  
   - They will be JOINED on the frontend, so together MUST fit in ${combinedLimit} chars
3. Maximum 3-4 action clauses per statement - NO laundry lists
4. END STRONG: Last phrase = promotion recommendation tied to their unique value
5. Use definitive language: "My #1", "must promote", "ready for next level"
6. USE ALLOWED ABBREVIATIONS: hrs, mos, wks, & (for "and"), K/M/B for metrics
   NEVER use "w/ " - it's not standard for EPBs

Format as JSON array:
["Rewritten statement 1 (~${charLimitPerStatement} chars)", "Rewritten statement 2 (~${charLimitPerStatement} chars)"]`;
          } else {
            // Regular MPA with 2 statements
            userPrompt = `REWRITE and TRANSFORM 2 pieces of raw input into HIGH-QUALITY EPB narrative statements for the "${mpa.label}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

${charLimitText}
${mpaContextSection}
=== RAW INPUT 1 (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext}
${impact1Instruction}

=== RAW INPUT 2 (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext2}
${impact2Instruction}
${customDirInstruction}
${mpaExamples.length > 0 ? `
EXAMPLE STATEMENTS (match this flow and readability):
${mpaExamples.slice(0, 2).map((e, i) => `${i + 1}. ${e.statement}`).join("\n")}
` : ""}

CRITICAL TRANSFORMATION REQUIREMENTS:
1. READABILITY IS #1 PRIORITY: Each statement must be scannable in 2-3 seconds
2. DO NOT copy input verbatim - REWRITE with improved structure
3. **CHARACTER MATH - THIS IS MANDATORY**:
   - Statement 1 + Statement 2 must be ≤ ${combinedLimit} characters TOTAL
   - Statement 1: aim for ~${charLimitPerStatement} chars
   - Statement 2: aim for ~${charLimitPerStatement} chars
   - USE ALLOWED ABBREVIATIONS: hrs, mos, wks, & (for "and"), K/M/B for metrics
     NEVER use "w/ " - it's not standard for EPBs
4. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses per statement - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent tense throughout)
   - Place the STRONGEST IMPACT at the END of each statement
   - If it sounds like a run-on when read aloud, it needs rewriting
5. STRUCTURE: [Action verb] + [Scope/Details] + [Result] + [BIGGEST IMPACT LAST]
6. Convert any dashes (--) to commas for proper EPB format

CRITICAL - DO NOT FABRICATE:
- NEVER invent numbers, dollar amounts, percentages, or quantities not in the input
- NEVER make up specific details, unit names, project names, or timelines
- If input is vague, output should reflect that vagueness - enhance structure only

BANNED VERBS - NEVER USE:
"Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated", "Utilized", "Impacted"
Use alternatives: Led, Directed, Managed, Drove, Championed, Transformed, Pioneered, Accelerated

VERB VARIETY: Each statement MUST start with a DIFFERENT action verb.${usedVerbsCustom.length > 0 ? `\n\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsCustom.join(", ")}\nUse different action verbs to maintain variety across the EPB.` : ""}

RELEVANCY: Rate how well this accomplishment fits "${mpa.label}" on a scale of 0-100.

Format as JSON object:
{"statements": ["Rewritten statement 1", "Rewritten statement 2"], "relevancy_score": 85}`;
          }
        } else {
          // SINGLE STATEMENT MODE
          const impactInstruction = buildImpactInstruction(impactFocus);
          
          if (isHLR) {
            // Build rank-appropriate promotion push language
            const promotionLang = {
              "AB": "promote ahead of peers", "Amn": "promote now, future NCO", 
              "A1C": "promote to SrA immediately", "SrA": "my strongest BTZ recommendation",
              "SSgt": "promote to TSgt now, ready for flight leadership",
              "TSgt": "promote to MSgt immediately, SNCO material",
              "MSgt": "promote to SMSgt now, ready for superintendent",
              "SMSgt": "my #1 for CMSgt", "CMSgt": "the standard for our force"
            };
            const rankPromo = promotionLang[rateeRank as keyof typeof promotionLang] || "promote immediately";
            
            userPrompt = `REWRITE and TRANSFORM the raw input into a HIGH-QUALITY HLR Assessment statement from the COMMANDER'S perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

=== RAW INPUT (REWRITE THIS) ===
${customContext}
${impactInstruction}
${customDirInstruction}

THE ENDING IS CRITICAL - The statement must END with a strong promotion push.
For ${rateeRank}: "${rankPromo}"

REQUIREMENTS:
1. DO NOT copy input verbatim - REWRITE with Commander's voice
2. ${charLimitText}
3. Maximum 3-4 action clauses - NO laundry lists
4. END STRONG: Last phrase = promotion recommendation tied to their unique value
5. Highlight what makes THIS Airman uniquely valuable

STRUCTURE:
[Commander's assessment] + [Unique value from input] + [PROMOTION PUSH - what you want for them]

BANNED: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"${usedVerbsCustom.length > 0 ? `\n\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsCustom.join(", ")}\nUse different action verbs to maintain variety across the EPB.` : ""}

Format as JSON array:
["Rewritten HLR statement"]`;
          } else {
            // Regular MPA with single statement
            userPrompt = `REWRITE and TRANSFORM the raw input into a HIGH-QUALITY EPB narrative statement for the "${mpa.label}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}
${mpaContextSection}
=== RAW INPUT (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext}
${impactInstruction}
${customDirInstruction}

${mpaExamples.length > 0 ? `
EXAMPLE STATEMENT (match this flow and readability):
${mpaExamples[0].statement}
` : ""}

TRANSFORMATION REQUIREMENTS:
1. ${charLimitText}
2. READABILITY IS #1 PRIORITY: Statement must be scannable in 2-3 seconds
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent tense throughout)
   - Place STRONGEST IMPACT at the END of the statement
   - If it sounds like a run-on when read aloud, rewrite it
4. DO NOT copy input verbatim - REWRITE with improved structure
5. Convert any dashes (--) to commas for proper EPB format
6. STRUCTURE: [Action verb] + [Scope/Details] + [Result] + [BIGGEST IMPACT LAST]
7. Chain max 2-3 impacts naturally: "achieved X, enabling Y"

CRITICAL - DO NOT FABRICATE:
- NEVER invent numbers, dollar amounts, percentages, or quantities not in the input
- NEVER make up specific details, unit names, project names, or timelines
- If input is vague, output should reflect that vagueness - enhance structure only

BANNED VERBS: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated", "Utilized"
Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered, Accelerated${usedVerbsCustom.length > 0 ? `\n\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsCustom.join(", ")}\nUse different action verbs to maintain variety across the EPB.` : ""}

RELEVANCY: Rate how well this accomplishment fits "${mpa.label}" on a scale of 0-100.

Format as JSON object:
{"statements": ["Rewritten statement"], "relevancy_score": 85}`;
          }
        }
      } else if (isHLR && hasEPBStatements) {
        // HLR from EPB Statements - Commander's holistic assessment from all MPA statements
        // Build rank-appropriate promotion push language
        const promotionLanguage = {
          "AB": "promote ahead of peers, ready for increased responsibility",
          "Amn": "promote now, future NCO in the making", 
          "A1C": "promote to SrA immediately, exceptional potential",
          "SrA": "my strongest BTZ recommendation, promote now",
          "SSgt": "promote to TSgt now, ready to lead at flight level",
          "TSgt": "promote to MSgt immediately, SNCO material today",
          "MSgt": "promote to SMSgt now, ready for superintendent duties",
          "SMSgt": "my #1 choice for CMSgt, promote immediately",
          "CMSgt": "the standard for our enlisted force, retain and challenge"
        };
        const rankPromotion = promotionLanguage[rateeRank as keyof typeof promotionLanguage] || "promote immediately";
        
        userPrompt = `Generate 2-3 HIGH-QUALITY Higher Level Reviewer (HLR) Assessment statements from the COMMANDER'S perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}
${dutyDescription ? `DUTY DESCRIPTION: ${dutyDescription}` : ""}

=== THE MEMBER'S EPB STATEMENTS ===
Review these MPA statements and extract what makes this Airman UNIQUELY VALUABLE:

${epbStatements!.map((s) => `[${s.label}]
${s.statement}
`).join("\n")}

=== COMMANDER'S HLR INTENT ===
The HLR is the Commander's personal endorsement. You are writing AS THE COMMANDER who:
1. KNOWS this Airman and their unique contributions
2. ADVOCATES for their future - what role/responsibility do they deserve?
3. PUNCHES THE ENDING with a strong promotion recommendation

THE ENDING IS CRITICAL:
Every HLR statement must END with a strong, definitive statement of what the Commander wants for this Airman.
- NOT generic ("promote now") but SPECIFIC to their demonstrated performance
- Connect their achievements to WHY they deserve the next level
- For ${rateeRank}: Consider endings like "${rankPromotion}"

EXAMPLES OF STRONG ENDINGS (tailor based on their actual achievements):
- "...select for SMSgt now, ready to lead a flight today"
- "...my #1 of 52 TSgts, give me 10 more just like this NCO"
- "...promote immediately, future Superintendent in the making"
- "...must promote, the backbone our squadron needs at the next level"
- "...fast-track to Senior NCO, this is what right looks like"

STRUCTURE:
[Commander's assessment/ranking] + [UNIQUE value this Airman brings - synthesized from EPB] + [PROMOTION PUSH - what you want for them]

REQUIREMENTS:
1. TARGET: ${Math.floor(effectiveMaxChars * 0.65)}-${effectiveMaxChars} characters per statement
2. SYNTHESIZE the EPB - identify 2-3 strongest themes across all MPAs
3. Highlight what makes THIS Airman different/valuable
4. Maximum 3-4 action clauses - NO laundry lists
5. END STRONG: The last phrase should be the promotion recommendation

GOOD EXAMPLES:
"My #1 of 47 SSgts--this leader delivered 100% mission success across 12 contingency ops while developing 8 Amn to BTZ, promote to TSgt immediately, ready for flight leadership."

"Exceptional NCO who saved $2.3M through innovative resource management and mentored our next generation of cyber warriors--must promote, exactly what we need at the Senior NCO level."

BAD EXAMPLES (weak endings, generic):
"Drove mission success and mentored Airmen, my strongest recommendation." (ending too generic)
"Top performer, promote now." (no connection to their unique value)

BANNED: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"

Generate EXACTLY 2-3 statements. Each must END with a strong, specific promotion push.

Format as JSON array only:
["Statement 1", "Statement 2", "Statement 3"]`;
      } else if (isHLR) {
        // HLR-specific prompt - Commander's perspective, holistic assessment (from accomplishments)
        // Extract verbs from existing EPB sections to avoid reuse (exclude HLR itself)
        const usedVerbsHLR = await extractUsedVerbsFromEPB(supabase, rateeId, cycleYear, mpa.key);

        // Build rank-appropriate promotion push language
        const promotionLanguage = {
          "AB": "promote ahead of peers, ready for increased responsibility",
          "Amn": "promote now, future NCO in the making", 
          "A1C": "promote to SrA immediately, exceptional potential",
          "SrA": "my strongest BTZ recommendation, promote now",
          "SSgt": "promote to TSgt now, ready to lead at flight level",
          "TSgt": "promote to MSgt immediately, SNCO material today",
          "MSgt": "promote to SMSgt now, ready for superintendent duties",
          "SMSgt": "my #1 choice for CMSgt, promote immediately",
          "CMSgt": "the standard for our enlisted force, retain and challenge"
        };
        const rankPromotion = promotionLanguage[rateeRank as keyof typeof promotionLanguage] || "promote immediately";
        
        userPrompt = `Generate 2-3 HIGH-QUALITY Higher Level Reviewer (HLR) Assessment statements from the COMMANDER'S perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}
${dutyDescription ? `DUTY DESCRIPTION: ${dutyDescription}` : ""}

ALL ACCOMPLISHMENTS FOR THIS CYCLE:
${accomplishments
  .map(
    (a, i) => `
[${i + 1}] [${a.mpa}] ${a.action_verb}: ${a.details}${a.impact ? `
    Impact: ${a.impact}` : ""}${a.metrics ? ` | Metrics: ${a.metrics}` : ""}
`
  )
  .join("")}

=== COMMANDER'S HLR INTENT ===
The HLR is the Commander's personal endorsement. You are writing AS THE COMMANDER who:
1. KNOWS this Airman and their unique contributions
2. ADVOCATES for their future - what role/responsibility do they deserve?
3. PUNCHES THE ENDING with a strong promotion recommendation

THE ENDING IS CRITICAL:
Every HLR statement must END with a strong, definitive statement of what the Commander wants for this Airman.
For ${rateeRank}: Consider endings like "${rankPromotion}"

EXAMPLES OF STRONG ENDINGS:
- "...select for SMSgt now, ready to lead a flight today"
- "...my #1 of 52 TSgts, give me 10 more just like this NCO"
- "...promote immediately, future Superintendent in the making"
- "...must promote, the backbone our squadron needs at the next level"

REQUIREMENTS:
1. TARGET: ${Math.floor(effectiveMaxChars * 0.65)}-${effectiveMaxChars} characters per statement
2. Maximum 3-4 action clauses - NO laundry lists
3. Synthesize accomplishments into what makes this Airman UNIQUELY valuable
4. END STRONG: The last phrase must be the promotion recommendation

STRUCTURE:
[Commander's assessment/ranking] + [Synthesized unique value] + [PROMOTION PUSH]

GOOD EXAMPLE:
"My #1 of 47 SSgts--drove 100% mission success across 12 contingency ops while developing 8 Amn to BTZ, promote to TSgt immediately, ready for flight leadership."

BAD EXAMPLE (weak ending):
"My top performer, drove mission success, mentored Amn, my strongest recommendation." (ending too generic)

BANNED: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"${usedVerbsHLR.length > 0 ? `\n\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsHLR.join(", ")}\nUse different action verbs to maintain variety across the EPB.` : ""}

Generate EXACTLY 2-3 statements. Each must END with a strong, specific promotion push.

Format as JSON array only:
["Statement 1", "Statement 2", "Statement 3"]`;
      } else if (generatePerAccomplishment) {
        // PER-ACCOMPLISHMENT MODE: Generate ONE full statement per accomplishment
        // This allows users to select which statements to combine later
        const allStatements: string[] = [];
        const allHistoryIds: string[] = [];
        const accomplishmentSources: { index: number; actionVerb: string; details: string }[] = [];

        // Extract verbs from existing EPB sections to avoid reuse (exclude current MPA)
        const usedVerbsPerAcc = await extractUsedVerbsFromEPB(supabase, rateeId, cycleYear, mpa.key);

        for (let accIdx = 0; accIdx < mpaAccomplishments.length; accIdx++) {
          const acc = mpaAccomplishments[accIdx];

        const verbAvoidanceInstruction = usedVerbsPerAcc.length > 0
          ? `\n\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsPerAcc.join(", ")}\nUse different action verbs to maintain variety across the EPB.`
          : "";

          const perAccPrompt = `Generate ONE HIGH-QUALITY EPB narrative statement for the "${mpa.label}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

SOURCE ACCOMPLISHMENT:
Action: ${acc.action_verb}
Details: ${acc.details}${acc.impact ? `
Impact: ${acc.impact}` : ""}
${acc.metrics ? `Metrics: ${acc.metrics}` : ""}

${mpaExamples.length > 0 ? `
EXAMPLE STATEMENTS (match this flow and readability):
${mpaExamples.slice(0, 2).map((e, i) => `${i + 1}. ${e.statement}`).join("\n")}
` : ""}

CRITICAL REQUIREMENTS:
1. TARGET: ${Math.floor(effectiveMaxChars * 0.45)}-${Math.floor(effectiveMaxChars * 0.55)} characters (~${Math.floor(effectiveMaxChars / 2)} chars).
   This statement may be combined with another, so keep it focused but complete.
2. READABILITY IS #1 PRIORITY: Statement must be scannable in 2-3 seconds
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 2-3 action clauses (this is a shorter statement)
   - Use PARALLEL verb structure (consistent tense)
   - Place STRONGEST IMPACT at the END
   - If it sounds like a run-on, rewrite it
4. STRUCTURE: [Action] + [Scope/Details] + [BIGGEST IMPACT LAST]
5. This is a COMPLETE statement on its own - not a fragment

BANNED VERBS: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"
Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered${verbAvoidanceInstruction}

Output ONLY the statement text, no quotes or JSON.`;

          try {
            const { text: accText } = await generateText({
              model: modelProvider,
              system: systemPrompt,
              prompt: perAccPrompt,
              temperature: 0.7,
              maxTokens: 500,
            });
            
            const cleanedStatement = accText.trim().replace(/^["']|["']$/g, "");
            if (cleanedStatement.length > 30) {
              allStatements.push(cleanedStatement);
              accomplishmentSources.push({
                index: accIdx,
                actionVerb: acc.action_verb,
                details: acc.details.substring(0, 50) + (acc.details.length > 50 ? "..." : ""),
              });
              
              // Save to history
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: historyData } = await (supabase as any)
                .from("statement_history")
                .insert({
                  user_id: user.id,
                  ratee_id: rateeId,
                  mpa: mpa.key,
                  afsc: rateeAfsc || "UNKNOWN",
                  rank: rateeRank,
                  statement: cleanedStatement,
                  model_used: model,
                  cycle_year: cycleYear,
                  is_draft: true,
                })
                .select("id")
                .single();
              
              if (historyData) {
                allHistoryIds.push(historyData.id);
              }
            }
          } catch (accError) {
            console.error(`Error generating for accomplishment ${accIdx}:`, accError);
          }
        }
        
        if (allStatements.length > 0) {
          results.push({
            mpa: mpa.key,
            statements: allStatements,
            historyIds: allHistoryIds,
            accomplishmentSources, // Include source info for UI display
          } as { mpa: string; statements: string[]; historyIds: string[]; relevancyScore?: number });
        }
        continue; // Skip the normal generation flow below
      } else {
        // Regular MPA prompt - combine accomplishments into 2-3 statement VERSIONS
        // Extract verbs from existing EPB sections to avoid reuse (exclude current MPA)
        const usedVerbsRegular = await extractUsedVerbsFromEPB(supabase, rateeId, cycleYear, mpa.key);

        // Get abbreviations for injection into user prompt
        const userAbbreviations = settings.abbreviations || [];
        const userAcronyms = settings.acronyms || [];
        
        // Format abbreviations for prompt
        const abbrevForPrompt = userAbbreviations.length > 0
          ? userAbbreviations.map(a => `"${a.word}" → "${a.abbreviation}"`).join(", ")
          : "hrs, mos, wks, & (for 'and'), K/M/B for metrics";
        
        // Get some key acronyms (top 10 most useful for character savings)
        const keyAcronyms = userAcronyms
          .filter(a => a.definition.length > 10) // Only include ones that save significant characters
          .slice(0, 10)
          .map(a => `${a.definition} → ${a.acronym}`)
          .join(", ");
        
        // For multi-accomplishment MPAs, we want SEPARATE statements that get combined later
        // Each statement should be ~half the max chars since they'll be joined
        const perStatementTarget = Math.floor((effectiveMaxChars - 2) / mpaAccomplishments.length);

        // Extract verbs from existing EPB sections to avoid reuse (exclude current MPA)
        const usedVerbs = await extractUsedVerbsFromEPB(supabase, rateeId, cycleYear, mpa.key);
        const verbAvoidanceInstruction = usedVerbsRegular.length > 0
          ? `\n**AVOID THESE VERBS (already used in other MPAs):** ${usedVerbsRegular.join(", ")}\nUse different action verbs to maintain variety across the EPB.`
          : "";

        userPrompt = `Generate EPB narrative statements for "${mpa.label}".

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

**TASK**: Write ONE statement per accomplishment below. They will be combined on the frontend.

**CHARACTER LIMITS (CRITICAL):**
- Each statement: ~${perStatementTarget} characters (MAX ${perStatementTarget + 10})
- All statements combined: ${effectiveMaxChars - 2} characters total
${userAbbreviations.length > 0 ? `\n**YOUR ABBREVIATIONS (from settings):** ${abbrevForPrompt}` : ""}
${keyAcronyms ? `\n**YOUR ACRONYMS (from settings):** ${keyAcronyms}` : ""}

SOURCE ACCOMPLISHMENTS (write one statement per item):
${mpaAccomplishments
  .map(
    (a, i) => `
[${i + 1}] Action: ${a.action_verb}
    Details: ${a.details}${a.impact ? `
    Impact: ${a.impact}` : ""}
    ${a.metrics ? `Metrics: ${a.metrics}` : ""}
`
  )
  .join("")}

${mpaExamples.length > 0 ? `
EXAMPLE STATEMENTS (match this style):
${mpaExamples.slice(0, 2).map((e, i) => `${i + 1}. ${e.statement}`).join("\n")}
` : ""}

**REQUIREMENTS:**
1. Write ONE complete sentence per accomplishment
2. Each sentence ~${perStatementTarget} chars (use abbreviations to fit!)
3. COMPLETE sentences - no truncation, no cutting off mid-word
4. BANNED VERBS: Spearheaded, Orchestrated, Synergized, Leveraged, Facilitated, Utilized, Impacted${verbAvoidanceInstruction}

**ALLOWED ABBREVIATIONS (only these are permitted):**
- TIME: "hours" → "hrs", "months" → "mos", "weeks" → "wks", "days" → "days"
- NUMBERS: Use digits (e.g., "three" → "3", "twelve" → "12")
- CONJUNCTION: "and" → "&" (saves 2 characters each time!)
- METRICS: K, M, B for thousands/millions/billions (e.g., "$50K", "1.2M users")

**BANNED ABBREVIATIONS (NEVER USE):**
- "w/ " - Not standard for EPBs, use "with" instead

**OUTPUT FORMAT:**
{"statements": ["Statement for accomplishment 1 (~${perStatementTarget} chars)", "Statement for accomplishment 2 (~${perStatementTarget} chars)"], "relevancy_score": 85}`;
      }

      // Inject clarifying context from previous generation (if user provided answers)
      let finalPrompt = userPrompt;
      if (clarifyingContext && clarifyingContext.trim().length > 0) {
        finalPrompt = `${userPrompt}

${clarifyingContext}

Use the clarifying information above to enhance your statements with more specific impacts, scope, and metrics.`;
      }
      
      // Add clarifying questions guidance (optional, non-blocking)
      const shouldRequestQuestions = requestClarifyingQuestions && !clarifyingContext;
      if (shouldRequestQuestions) {
        // Only request questions on first generation, not on regeneration with answers
        finalPrompt = `${finalPrompt}

${CLARIFYING_QUESTION_GUIDANCE}

**IMPORTANT: OUTPUT FORMAT WHEN CLARIFYING QUESTIONS APPLY**
You MUST respond with a JSON OBJECT (not array) in this format:
{
  "statements": ["Statement 1", "Statement 2", "Statement 3"],
  "clarifyingQuestions": [
    {"question": "Did this save time or money? How much?", "category": "impact", "hint": "Quantify savings if possible"},
    {"question": "How many people were on the team they led?", "category": "leadership", "hint": "Specific numbers help"}
  ]
}

Include 1-3 clarifying questions if the input lacks:
- Specific metrics (time saved, money saved, people impacted)
- Scope clarity (unit level vs wing level vs AF-wide)
- Leadership details (team size, people developed)
- Recognition context (why selected, competition level)

If the input is already detailed enough, you may omit clarifyingQuestions but still use the object format with just "statements".`;
      }

      try {
        const { text } = await generateText({
          model: modelProvider,
          system: systemPrompt,
          prompt: finalPrompt,
          temperature: 0.75, // Slightly higher for creative expansion
          maxTokens: 1800, // Increased to allow room for clarifying questions
        });

        let statements: string[] = [];
        let relevancyScore: number | undefined;
        let clarifyingQuestions: ClarifyingQuestionResponse[] = [];
        
        // Log raw response for debugging (first 500 chars)
        console.log(`[Generate] Raw LLM response for ${mpa.key}:`, text.substring(0, 500));
        
        try {
          // Try to parse as JSON object with statements, relevancy_score, and clarifyingQuestions
          const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
          if (jsonObjMatch) {
            const parsed = JSON.parse(jsonObjMatch[0]);
            statements = parsed.statements || [];
            relevancyScore = typeof parsed.relevancy_score === "number" ? parsed.relevancy_score : undefined;
            // Extract clarifying questions if present
            if (Array.isArray(parsed.clarifyingQuestions)) {
              clarifyingQuestions = parsed.clarifyingQuestions.filter(
                (q: unknown) => typeof q === "object" && q !== null && "question" in q
              );
              console.log(`[Generate] Found ${clarifyingQuestions.length} clarifying questions for ${mpa.key}`);
            } else if (shouldRequestQuestions) {
              console.log(`[Generate] No clarifyingQuestions array in response for ${mpa.key}`);
            }
          } else {
            // Fallback: try to parse as array
            const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
            if (jsonArrayMatch) {
              statements = JSON.parse(jsonArrayMatch[0]);
            } else {
              statements = text
                .split("\n")
                .filter((line) => line.trim().length > 50)
                .slice(0, 3);
            }
          }
        } catch {
          // Final fallback: extract lines
          statements = text
            .split("\n")
            .filter((line) => line.trim().length > 50)
            .slice(0, 3);
        }

        if (statements.length > 0) {
          // Log the raw statements BEFORE any processing
          console.log(`[Generate] === RAW STATEMENTS (before sanitization) for ${mpa.key} ===`);
          statements.forEach((s, i) => {
            console.log(`  [${i + 1}] (${s.length} chars): "${s.substring(0, 150)}..."`);
          });
          
          // IMMEDIATE SANITIZATION: Clean up any garbage from initial generation
          // Also applies abbreviations and acronyms from user settings
          const { sanitizeStatements } = await import("@/lib/quality-control");
          const userAbbrevs = settings.abbreviations || [];
          const userAcros = settings.acronyms || [];
          const sanitizationResult = sanitizeStatements(statements, userAbbrevs, userAcros);
          if (sanitizationResult.hadIssues) {
            console.log(`[Generate] Sanitized ${sanitizationResult.issueCount} statement(s) from initial generation`);
            console.log(`[Generate] Applied ${userAbbrevs.length} abbreviations and checked ${userAcros.length} acronyms`);
            statements = sanitizationResult.sanitized;
            
            // Log after sanitization
            console.log(`[Generate] === AFTER SANITIZATION for ${mpa.key} ===`);
            statements.forEach((s, i) => {
              console.log(`  [${i + 1}] (${s.length} chars): "${s.substring(0, 150)}..."`);
            });
          }
          
          // POST-GENERATION QUALITY CONTROL
          // Single consolidated QC pass that handles:
          // - Character count enforcement (when fillToMax is enabled)
          // - Statement diversity check
          // - Instruction compliance verification
          // This is ONE LLM call instead of multiple per-statement calls
          let verifiedStatements = statements;
          let qcFeedback: string | undefined;
          
          // TEMPORARILY DISABLE QC to debug if QC is causing the issue
          const ENABLE_QC = false; // Set to true to re-enable QC
          
          if (ENABLE_QC && shouldEnforceCharLimits && fillToMax) {
            const targetMin = effectiveMaxChars - 10;
            
            // Check if QC is worth running
            const qcCheck = shouldRunQualityControl(statements, fillToMax, effectiveMaxChars, targetMin);
            
            if (qcCheck.shouldRun) {
              try {
                const qcConfig: QualityControlConfig = {
                  statements,
                  userPrompt: userPrompt, // The prompt used to generate these statements
                  targetMaxChars: effectiveMaxChars,
                  targetMinChars: targetMin,
                  fillToMax,
                  context: `${mpa.label} statement for ${rateeRank}`,
                  model: modelProvider as LanguageModel,
                };
                
                const qcResult = await performQualityControl(qcConfig);
                
                verifiedStatements = qcResult.statements;
                qcFeedback = qcResult.evaluation.overallFeedback;
                
                // Log AFTER QC
                console.log(`[Generate] === STATEMENTS AFTER QC for ${mpa.key} ===`);
                verifiedStatements.forEach((s, i) => {
                  console.log(`  [${i + 1}] (${s.length} chars): "${s.substring(0, 100)}..."`);
                });
                
                // Log QC results
                console.log(
                  `[Generate] QC for ${mpa.key}: ` +
                  `adjusted=${qcResult.wasAdjusted}, ` +
                  `diversity=${qcResult.evaluation.diversityScore}, ` +
                  `compliance=${qcResult.evaluation.instructionCompliance}, ` +
                  `charLimits=${qcResult.evaluation.allMeetCharacterLimits}, ` +
                  `reason=${qcResult.stopReason}`
                );
                
                // Log individual statement adjustments if any
                if (qcResult.wasAdjusted) {
                  qcResult.evaluation.statementEvaluations.forEach((evalItem, i) => {
                    if (evalItem.originalLength !== evalItem.characterCount) {
                      console.log(
                        `  Statement ${i + 1}: ${evalItem.originalLength} → ${evalItem.characterCount} chars, ` +
                        `compliance=${evalItem.instructionCompliance}%`
                      );
                    }
                  });
                }
              } catch (qcError) {
                console.error(`[Generate] QC failed for ${mpa.key}:`, qcError);
                // Fall back to original statements
                verifiedStatements = statements;
              }
            } else {
              console.log(`[Generate] Skipping QC for ${mpa.key}: ${qcCheck.reason}`);
            }
          }
          
          const historyIds: string[] = [];
          
          for (const statement of verifiedStatements) {
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

          // Include QC feedback and clarifying questions in results if available
          results.push({ 
            mpa: mpa.key, 
            statements: verifiedStatements, 
            historyIds, 
            relevancyScore,
            ...(qcFeedback && { qcFeedback }),
            ...(clarifyingQuestions.length > 0 && { clarifyingQuestions }),
          });
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
