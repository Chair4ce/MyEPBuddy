import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { DEFAULT_ACRONYMS, formatAcronymsList } from "@/lib/default-acronyms";
import { formatAbbreviationsList } from "@/lib/default-abbreviations";
import { STANDARD_MGAS, DEFAULT_MPA_DESCRIPTIONS, formatMPAContext } from "@/lib/constants";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import type { MPADescriptions } from "@/types/database";
import type { Rank, WritingStyle, UserLLMSettings, MajorGradedArea, Acronym, Abbreviation } from "@/types/database";

interface AccomplishmentData {
  mpa: string;
  action_verb: string;
  details: string;
  impact: string;
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

interface ExampleStatement {
  mpa: string;
  statement: string;
  source: "personal" | "community";
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
4. Character range: AIM for {{max_characters_per_statement}} characters. Minimum 220 characters, maximum {{max_characters_per_statement}}.
5. Generate exactly 2–3 strong statements per Major Performance Area.
6. Output pure, clean text only — no formatting.

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
    const { rateeId, rateeRank, rateeAfsc, cycleYear, model, writingStyle, communityMpaFilter, communityAfscFilter, accomplishments, selectedMPAs, customContext, customContextOptions, generatePerAccomplishment, dutyDescription } = body;

    // Either accomplishments or customContext must be provided
    const hasAccomplishments = accomplishments && accomplishments.length > 0;
    const hasCustomContext = customContext && customContext.trim().length > 0;

    if (!rateeRank || (!hasAccomplishments && !hasCustomContext)) {
      return NextResponse.json(
        { error: "Missing required fields - provide accomplishments or custom context" },
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
    const maxChars = settings.max_characters_per_statement || 350;
    const maxHlrChars = 250; // HLR has a smaller character limit
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

      // Skip if no source material (unless using custom context)
      if (!hasCustomContext && mpaAccomplishments.length === 0 && !isHLR) {
        continue;
      }

      // Skip HLR if no accomplishments at all (but allow with custom context)
      if (!hasCustomContext && isHLR && accomplishments.length === 0) {
        continue;
      }

      const mpaExamples = examples.filter((e) => e.mpa === mpa.key);

      // Build different prompts based on source type (custom context vs accomplishments) and MPA type
      let userPrompt: string;
      
      // Calculate character limits (HLR has smaller limit)
      const effectiveMaxChars = isHLR ? maxHlrChars : maxChars;
      
      if (hasCustomContext) {
        // Custom context mode - use the raw text as source material
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
        const charLimitPerStatement = stmtCount === 2 ? Math.floor(effectiveMaxChars / 2) : effectiveMaxChars;
        const charLimitText = stmtCount === 2 
          ? `CRITICAL: Both statements SHARE a ${effectiveMaxChars} character limit. Each statement should be ~${charLimitPerStatement} characters (max ${charLimitPerStatement + 20} each).`
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
            userPrompt = `REWRITE and TRANSFORM 2 pieces of raw input into HIGH-QUALITY Higher Level Reviewer (HLR) Assessment statements from the Commander's perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

${charLimitText}

=== RAW INPUT 1 (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext}
${impact1Instruction}

=== RAW INPUT 2 (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext2}
${impact2Instruction}
${customDirInstruction}
HLR TRANSFORMATION REQUIREMENTS:
1. DO NOT copy input verbatim - REWRITE with Commander's voice and improved structure
2. Generate 2 DISTINCT statements - one from each source context
3. Both statements COMBINED must fit within ${effectiveMaxChars} characters (~${charLimitPerStatement} each)
4. READABILITY IS KEY: Each statement must be scannable in 2-3 seconds
5. Maximum 3-4 action clauses per statement - avoid laundry lists
6. Place the STRONGEST IMPACT at the END of each statement
7. Use PARALLEL verb structure throughout each statement
8. Write from Commander's perspective - strategic endorsement
9. Use definitive language: "My top performer", "Ready for immediate promotion"
10. Convert any dashes (--) to commas for proper format

Format as JSON array:
["Rewritten statement 1", "Rewritten statement 2"]`;
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
3. Both statements COMBINED must fit within ${effectiveMaxChars} characters (~${charLimitPerStatement} each)
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

VERB VARIETY: Each statement MUST start with a DIFFERENT action verb.

RELEVANCY: Rate how well this accomplishment fits "${mpa.label}" on a scale of 0-100.

Format as JSON object:
{"statements": ["Rewritten statement 1", "Rewritten statement 2"], "relevancy_score": 85}`;
          }
        } else {
          // SINGLE STATEMENT MODE
          const impactInstruction = buildImpactInstruction(impactFocus);
          
          if (isHLR) {
            userPrompt = `REWRITE and TRANSFORM the raw input into a HIGH-QUALITY Higher Level Reviewer (HLR) Assessment statement from the Commander's perspective.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

=== RAW INPUT (REWRITE THIS - DO NOT COPY VERBATIM) ===
${customContext}
${impactInstruction}
${customDirInstruction}
HLR TRANSFORMATION REQUIREMENTS:
1. DO NOT copy input verbatim - REWRITE with Commander's voice and improved structure
2. ${charLimitText}
3. READABILITY IS KEY: Statement must be scannable in 2-3 seconds
4. Maximum 3-4 action clauses - avoid laundry lists of 5+ actions
5. Place STRONGEST IMPACT at the END of the statement
6. Use PARALLEL verb structure throughout
7. Write from Commander's perspective - strategic endorsement
8. Use definitive language: "My top performer", "Ready for immediate promotion"
9. Convert any dashes (--) to commas for proper format

CRITICAL - DO NOT FABRICATE:
- NEVER invent numbers, dollar amounts, or metrics not in the input
- If input is vague, enhance structure and language only, not content substance

BANNED: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"

STRUCTURE:
[Strategic assessment] + [Key accomplishment] + [BIGGEST IMPACT LAST]

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
Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered, Accelerated

RELEVANCY: Rate how well this accomplishment fits "${mpa.label}" on a scale of 0-100.

Format as JSON object:
{"statements": ["Rewritten statement"], "relevancy_score": 85}`;
          }
        }
      } else if (isHLR) {
        // HLR-specific prompt - Commander's perspective, holistic assessment
        userPrompt = `Generate 2-3 HIGH-QUALITY Higher Level Reviewer (HLR) Assessment statements from the Commander's perspective.

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
1. TARGET: ${Math.floor(effectiveMaxChars * 0.65)}-${effectiveMaxChars} characters per statement. PRIORITIZE READABILITY.
2. READABILITY IS #1 PRIORITY: Each statement must be scannable in 2-3 seconds by board members
3. SENTENCE STRUCTURE (CRITICAL):
   - Maximum 3-4 action clauses per statement - NO laundry lists of 5+ actions
   - Use PARALLEL verb structure (consistent tense throughout)
   - Place STRONGEST IMPACT and PROMOTION RECOMMENDATION at the END
   - If it sounds like a run-on when read aloud, rewrite it
4. Write from Commander's perspective - strategic endorsement
5. Synthesize OVERALL performance across all MPAs into cohesive narrative
6. Use definitive language: "My top performer", "Ready for immediate promotion"

STRUCTURE EACH STATEMENT:
[Strategic assessment] + [Key accomplishment synthesis] + [BIGGEST IMPACT + PROMOTION REC LAST]

GOOD EXAMPLE (readable, strong ending):
"My #1 of 47 SSgts, drove 100% mission success across 12 contingency ops, mentored 8 Amn to BTZ, directed $2.3M equipment modernization, ready to lead at flight level."

BAD EXAMPLE (run-on, laundry list):
"My top performer, drove mission success, mentored Amn, directed modernization, enhanced capability, improved readiness, supported operations, my strongest recommendation."

BANNED: "Spearheaded", "Orchestrated", "Synergized", "Leveraged", "Facilitated"

Generate EXACTLY 2-3 statements. Each must be READABLE in 2-3 seconds.

Format as JSON array only:
["Statement 1", "Statement 2", "Statement 3"]`;
      } else if (generatePerAccomplishment) {
        // PER-ACCOMPLISHMENT MODE: Generate ONE full statement per accomplishment
        // This allows users to select which statements to combine later
        const allStatements: string[] = [];
        const allHistoryIds: string[] = [];
        const accomplishmentSources: { index: number; actionVerb: string; details: string }[] = [];
        
        for (let accIdx = 0; accIdx < mpaAccomplishments.length; accIdx++) {
          const acc = mpaAccomplishments[accIdx];
          
          const perAccPrompt = `Generate ONE HIGH-QUALITY EPB narrative statement for the "${mpa.label}" Major Performance Area.

RATEE: ${rateeRank} | AFSC: ${rateeAfsc || "N/A"}

SOURCE ACCOMPLISHMENT:
Action: ${acc.action_verb}
Details: ${acc.details}
Impact: ${acc.impact}
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
Use alternatives: Led, Directed, Drove, Championed, Transformed, Pioneered

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
        // Regular MPA prompt - combine accomplishments into 2-3 statements
        userPrompt = `Generate 2-3 HIGH-QUALITY EPB narrative statements for the "${mpa.label}" Major Performance Area.

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
EXAMPLE STATEMENTS (match this flow and readability):
${mpaExamples.map((e, i) => `${i + 1}. ${e.statement}`).join("\n")}
` : ""}

CRITICAL REQUIREMENTS:
1. TARGET: ${Math.floor(effectiveMaxChars * 0.65)}-${effectiveMaxChars} characters per statement. PRIORITIZE READABILITY over raw length.
2. SENTENCE STRUCTURE (MOST IMPORTANT):
   - Each statement must read naturally when spoken aloud
   - Maximum 3-4 action clauses per statement (NOT a laundry list of 5+ actions)
   - Use PARALLEL verb structure (all past tense OR all present participles, not mixed)
   - Place the STRONGEST IMPACT at the END of each statement
   - If source has 4+ distinct accomplishments, split across multiple statements
3. STRUCTURE: [Action] + [Scope/Details] + [Result] + [BIGGEST IMPACT LAST]
4. CHAIN impacts naturally: "achieved X, enabling Y" (max 2-3 chained results)

GOOD EXAMPLE (readable, focused, strong ending):
"Led 12 Airmen in rapid overhaul of 8 authentication servers, delivering wing directive 29 days ahead of schedule, ensuring uninterrupted network access for 58K users."

BAD EXAMPLE (run-on, laundry list, weak ending):
"Directed 12 Amn in rebuilding 8 servers, advancing directive completion by 29 days, crafted assessment, fixed 27 errors, purged 9.6TB data, averting outage, streamlining access."

BANNED VERBS: Spearheaded, Orchestrated, Synergized, Leveraged, Facilitated, Utilized, Impacted

Generate EXACTLY 2-3 statements. Each must be READABLE in 2-3 seconds.

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
        let relevancyScore: number | undefined;
        
        try {
          // Try to parse as JSON object with statements and relevancy_score
          const jsonObjMatch = text.match(/\{[\s\S]*"statements"[\s\S]*\}/);
          if (jsonObjMatch) {
            const parsed = JSON.parse(jsonObjMatch[0]);
            statements = parsed.statements || [];
            relevancyScore = typeof parsed.relevancy_score === "number" ? parsed.relevancy_score : undefined;
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

          results.push({ mpa: mpa.key, statements, historyIds, relevancyScore });
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
