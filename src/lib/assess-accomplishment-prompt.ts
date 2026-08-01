/**
 * Shared accomplishment assessment prompt for preview + saved assess routes.
 */

import {
  DEFAULT_MPA_DESCRIPTIONS,
  ENTRY_MGAS,
  getRubricTierForRank,
  ACA_RUBRIC_JUNIOR,
  ACA_RUBRIC_SENIOR,
  type ACARubric,
} from "@/lib/constants";
import {
  AF_STEWARDSHIP_IMPACT_BRIEF,
  STEWARDSHIP_ASSESSMENT_CRITERIA,
  formatStewardshipImpactForPrompt,
  normalizeStewardshipImpact,
} from "@/lib/stewardship-impact";
import type { Rank, StewardshipImpact } from "@/types/database";

export interface AccomplishmentAssessmentInput {
  action_verb: string;
  details: string;
  impact: string | null;
  metrics: string | null;
  mpa: string;
  stewardship_impact?: StewardshipImpact | null;
}

/** Build the assessment prompt for an individual accomplishment using rank-appropriate ACA rubric */
export function buildAccomplishmentAssessmentPrompt(
  accomplishment: AccomplishmentAssessmentInput,
  rateeRank: string | null
): string {
  const rubricTier = getRubricTierForRank(rateeRank as Rank);
  if (!rubricTier) {
    throw new Error("No ACA rubric applies to this rank");
  }
  const rubric: ACARubric =
    rubricTier === "senior" ? ACA_RUBRIC_SENIOR : ACA_RUBRIC_JUNIOR;
  const formUsed = rubricTier === "senior" ? "AF Form 932" : "AF Form 931";
  const rankRange =
    rubricTier === "senior" ? "MSgt through SMSgt" : "AB through TSgt";

  const mpaDescriptions = ENTRY_MGAS.filter((m) => m.key !== "hlr_assessment")
    .map((mpa) => {
      const desc = DEFAULT_MPA_DESCRIPTIONS[mpa.key];
      if (!desc) return "";

      let section = `### ${desc.title} (${mpa.key})\n${desc.description}\n`;
      const subComps = Object.entries(desc.sub_competencies);
      if (subComps.length > 0) {
        section += "Sub-competencies:\n";
        subComps.forEach(([key, description]) => {
          const label = key
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          section += `- ${label}: ${description}\n`;
        });
      }
      return section;
    })
    .filter(Boolean)
    .join("\n");

  let rubricSection = "";
  for (const [, category] of Object.entries(rubric)) {
    rubricSection += `\n## ${category.title}\nFocus: ${category.focus}\n`;
    for (const [, sub] of Object.entries(category.subcategories)) {
      rubricSection += `\n### ${sub.label}\n${sub.description}\n`;
      rubricSection += "Proficiency Levels:\n";
      for (const [level, desc] of Object.entries(sub.levels)) {
        const levelLabel = level
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        rubricSection += `- **${levelLabel}**: ${desc}\n`;
      }
    }
  }

  const rankExpectations =
    rubricTier === "senior"
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

  const stewardship = normalizeStewardshipImpact(
    accomplishment.stewardship_impact ?? {}
  );
  const impactBlock = formatStewardshipImpactForPrompt(
    stewardship,
    accomplishment.impact,
    accomplishment.metrics
  );

  const accomplishmentText = `
Action: ${accomplishment.action_verb}
Details: ${accomplishment.details}
${impactBlock}
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

## AF STEWARDSHIP CONTEXT (Managing Resources)
${AF_STEWARDSHIP_IMPACT_BRIEF}

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
When stewardship fields quantify man-hours, funds/cost avoidance, or equipment/manpower recovery, weight managing_resources relevancy accordingly if those levers are present.

### Quality Indicators (0-100 each)
Based on the ACA rubric proficiency levels:
- **action_clarity**: How clearly and specifically the action is described (Does Not Meet=0-25, Meets=26-60, Exceeds=61-80, ${rubricTier === "senior" ? "Significantly Exceeds" : "Far Exceeds"}=81-100)
- **impact_significance**: How significant/meaningful the impact or result is, relative to rank expectations — prefer AF stewardship payoff (man-hours, schedule compression / finished early vs on-time, cost avoidance, equipment/manpower) cascading to readiness/mission over vague "mission success". Score higher when a credible early/% faster delta is present than for merely meeting a deadline.
- **metrics_quality**: Quality and specificity of quantifiable metrics (numbers, percentages, man-hours, dollars, FMC/sortie counts, baseline→actual timelines, N early, % faster, etc.)
- **scope_definition**: How well the scope/scale of the accomplishment is defined for ${rateeRank || "the Airman's"} level

${STEWARDSHIP_ASSESSMENT_CRITERIA}

### Overall Score (0-100)
Composite score considering:
- Clarity and specificity of the accomplishment
- Significance of impact **relative to rank expectations**
- Presence of quantifiable results (including stewardship levers when provided)
- Alignment with Air Force values and mission
- **Appropriate scope for ${rateeRank || "the Airman's"} level of responsibility per AFI 36-2618**
- ACA rubric proficiency level alignment

IMPORTANT: A junior Airman (AB-TSgt) should NOT be penalized for not showing senior-level leadership. Evaluate accomplishments within the context of their rank and expected duties per the appropriate ACA form. Blank stewardship levers must NOT auto-fail juniors.

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
