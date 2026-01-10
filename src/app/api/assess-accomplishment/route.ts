import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { 
  DEFAULT_MPA_DESCRIPTIONS, 
  ENTRY_MGAS,
  getRubricTierForRank,
  ACA_RUBRIC_JUNIOR,
  ACA_RUBRIC_SENIOR,
  type ACARubric,
  type Rank
} from "@/lib/constants";
import type { AccomplishmentAssessmentScores } from "@/types/database";

interface AssessAccomplishmentRequest {
  accomplishmentId: string;
  model?: string;
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

// Build the assessment prompt for an individual accomplishment using rank-appropriate ACA rubric
function buildAccomplishmentAssessmentPrompt(
  accomplishment: {
    action_verb: string;
    details: string;
    impact: string | null;
    metrics: string | null;
    mpa: string;
  },
  rateeRank: string | null
): string {
  // Determine which ACA rubric to use based on rank
  const rubricTier = getRubricTierForRank(rateeRank as Rank);
  const rubric: ACARubric = rubricTier === "senior" ? ACA_RUBRIC_SENIOR : ACA_RUBRIC_JUNIOR;
  const formUsed = rubricTier === "senior" ? "AF Form 932" : "AF Form 931";
  const rankRange = rubricTier === "senior" ? "MSgt through SMSgt" : "AB through TSgt";
  
  // Build MPA descriptions section
  const mpaDescriptions = ENTRY_MGAS
    .filter(m => m.key !== "hlr_assessment")
    .map(mpa => {
      const desc = DEFAULT_MPA_DESCRIPTIONS[mpa.key];
      if (!desc) return "";
      
      let section = `### ${desc.title} (${mpa.key})\n${desc.description}\n`;
      const subComps = Object.entries(desc.sub_competencies);
      if (subComps.length > 0) {
        section += "Sub-competencies:\n";
        subComps.forEach(([key, description]) => {
          const label = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          section += `- ${label}: ${description}\n`;
        });
      }
      return section;
    })
    .filter(Boolean)
    .join("\n");

  // Build ACA rubric reference section with rank-appropriate expectations
  let rubricSection = "";
  for (const [, category] of Object.entries(rubric)) {
    rubricSection += `\n## ${category.title}\nFocus: ${category.focus}\n`;
    for (const [, sub] of Object.entries(category.subcategories)) {
      rubricSection += `\n### ${sub.label}\n${sub.description}\n`;
      rubricSection += "Proficiency Levels:\n";
      for (const [level, desc] of Object.entries(sub.levels)) {
        const levelLabel = level.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        rubricSection += `- **${levelLabel}**: ${desc}\n`;
      }
    }
  }

  // Build rank-specific expectations
  const rankExpectations = rubricTier === "senior"
    ? `As a Senior NCO (${rateeRank || "MSgt-SMSgt"}), accomplishments should demonstrate:
- Strategic thinking and unit-wide impact
- Leadership and mentorship of others
- Resource management and program oversight
- Driving organizational change and innovation
- Setting standards and accountability for subordinates`
    : `As a Junior Enlisted or NCO (${rateeRank || "AB-TSgt"}), accomplishments should demonstrate:
- Task proficiency and job knowledge
- Initiative and motivation
- Training progression and certifications
- Adherence to standards and regulations
- Teamwork and supporting the mission`;

  const accomplishmentText = `
Action: ${accomplishment.action_verb}
Details: ${accomplishment.details}
${accomplishment.impact ? `Impact: ${accomplishment.impact}` : ""}
${accomplishment.metrics ? `Metrics: ${accomplishment.metrics}` : ""}
Currently categorized as: ${DEFAULT_MPA_DESCRIPTIONS[accomplishment.mpa]?.title || accomplishment.mpa}
`.trim();

  return `You are an expert Air Force performance evaluator using the Airman Comprehensive Assessment (ACA) Worksheet (${formUsed}) as your rubric. Assess this accomplishment entry for a ${rankRange} Airman.

## RATEE INFORMATION
- Rank: ${rateeRank || "Not specified"}
- Rubric: ${formUsed} (${rankRange})

## RANK-APPROPRIATE EXPECTATIONS
${rankExpectations}

## ACCOMPLISHMENT TO ASSESS
${accomplishmentText}

## MPA DEFINITIONS (Use these to score relevancy)
${mpaDescriptions}

## ACA RUBRIC REFERENCE (${formUsed})
${rubricSection}

## SCORING CRITERIA

### MPA Relevancy (0-100 for each)
- 90-100: Perfect fit - accomplishment directly and primarily demonstrates this competency
- 70-89: Strong fit - accomplishment clearly relates to this competency
- 50-69: Moderate fit - some aspects relate to this competency
- 30-49: Weak fit - tangential relationship
- 0-29: Poor fit - little to no relevance

### Quality Indicators (0-100 each)
Based on the ACA rubric proficiency levels:
- **action_clarity**: How clearly and specifically the action is described (Does Not Meet=0-25, Meets=26-60, Exceeds=61-80, ${rubricTier === "senior" ? "Significantly Exceeds" : "Far Exceeds"}=81-100)
- **impact_significance**: How significant/meaningful the impact or result is, relative to rank expectations
- **metrics_quality**: Quality and specificity of quantifiable metrics (numbers, percentages, etc.)
- **scope_definition**: How well the scope/scale of the accomplishment is defined for ${rateeRank || "the Airman's"} level

### Overall Score (0-100)
Composite score considering:
- Clarity and specificity of the accomplishment
- Significance of impact **relative to rank expectations**
- Presence of quantifiable results
- Alignment with Air Force values and mission
- **Appropriate scope for ${rateeRank || "the Airman's"} level of responsibility per AFI 36-2618**
- ACA rubric proficiency level alignment

IMPORTANT: A junior Airman (AB-TSgt) should NOT be penalized for not showing senior-level leadership. Evaluate accomplishments within the context of their rank and expected duties per the appropriate ACA form.

## OUTPUT FORMAT (JSON only)
{
  "mpa_relevancy": {
    "executing_mission": <0-100>,
    "leading_people": <0-100>,
    "managing_resources": <0-100>,
    "improving_unit": <0-100>
  },
  "overall_score": <0-100>,
  "quality_indicators": {
    "action_clarity": <0-100>,
    "impact_significance": <0-100>,
    "metrics_quality": <0-100>,
    "scope_definition": <0-100>
  },
  "primary_mpa": "<mpa_key with highest relevancy>",
  "secondary_mpa": "<mpa_key with second highest relevancy, or null if not close>",
  "aca_tier": "${rubricTier}",
  "form_used": "${formUsed}"
}

Respond with ONLY the JSON object, no additional text.`;
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

    const body: AssessAccomplishmentRequest = await request.json();
    const { accomplishmentId, model = "gemini-2.0-flash" } = body;

    if (!accomplishmentId) {
      return NextResponse.json(
        { error: "Missing required field: accomplishmentId" },
        { status: 400 }
      );
    }

    // Fetch the accomplishment
    const { data: accomplishment, error: fetchError } = await supabase
      .from("accomplishments")
      .select("*")
      .eq("id", accomplishmentId)
      .single();

    if (fetchError || !accomplishment) {
      return NextResponse.json(
        { error: "Accomplishment not found" },
        { status: 404 }
      );
    }

    // Verify user has access (owner or supervisor)
    const isOwner = accomplishment.user_id === user.id;
    const isCreator = accomplishment.created_by === user.id;
    
    if (!isOwner && !isCreator) {
      // Check if user is in the supervisor chain
      const { data: subordinateChain } = await supabase
        .rpc("get_subordinate_chain", { supervisor_uuid: user.id });
      
      const isInChain = subordinateChain?.some(
        (s: { subordinate_id: string }) => s.subordinate_id === accomplishment.user_id
      );
      
      if (!isInChain) {
        return NextResponse.json(
          { error: "Access denied to this accomplishment" },
          { status: 403 }
        );
      }
    }

    // Get the profile of the accomplishment owner for rank context
    const { data: profile } = await supabase
      .from("profiles")
      .select("rank")
      .eq("id", accomplishment.user_id)
      .single();

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Build the assessment prompt with rank-appropriate ACA rubric
    const assessmentPrompt = buildAccomplishmentAssessmentPrompt(
      {
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact,
        metrics: accomplishment.metrics,
        mpa: accomplishment.mpa,
      },
      profile?.rank || null
    );

    // Get model provider
    const modelProvider = getModelProvider(model, userKeys);

    // Generate the assessment
    const { text } = await generateText({
      model: modelProvider,
      prompt: assessmentPrompt,
      temperature: 0.2, // Low temperature for consistent scoring
      maxTokens: 1500,
    });

    // Parse the response
    let assessment: AccomplishmentAssessmentScores;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        assessment = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse assessment response:", parseError);
      console.error("Raw response:", text);
      return NextResponse.json(
        { error: "Failed to parse assessment results" },
        { status: 500 }
      );
    }

    // Validate the assessment structure
    if (
      !assessment.mpa_relevancy ||
      typeof assessment.overall_score !== "number" ||
      !assessment.quality_indicators
    ) {
      return NextResponse.json(
        { error: "Invalid assessment structure returned" },
        { status: 500 }
      );
    }

    // Update the accomplishment with assessment scores
    const { error: updateError } = await supabase
      .from("accomplishments")
      .update({
        assessment_scores: assessment,
        assessed_at: new Date().toISOString(),
        assessment_model: model,
      })
      .eq("id", accomplishmentId);

    if (updateError) {
      console.error("Failed to update accomplishment with assessment:", updateError);
      return NextResponse.json(
        { error: "Failed to save assessment results" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      assessment,
      assessed_at: new Date().toISOString(),
      model 
    });
  } catch (error) {
    console.error("Assess accomplishment API error:", error);
    return NextResponse.json(
      { error: "Failed to assess accomplishment" },
      { status: 500 }
    );
  }
}
