import {
  ACA_RUBRIC_JUNIOR,
  ACA_RUBRIC_SENIOR,
  getRubricTierForRank,
} from "@/lib/constants";
import type { FeedbackType, Rank } from "@/types/database";

type RubricCategory = {
  title: string;
  focus: string;
  subcategories: Record<
    string,
    { label: string; description: string; levels: Record<string, string> }
  >;
};

function getRubricForRank(rateeRank: Rank | string | null): {
  formLabel: string;
  categories: RubricCategory[];
  knowingYourAirmanSection: string;
} {
  const tier = getRubricTierForRank(rateeRank as Rank);
  const rubric = tier === "senior" ? ACA_RUBRIC_SENIOR : ACA_RUBRIC_JUNIOR;
  const formLabel = tier === "senior" ? "AF Form 932" : "AF Form 931";
  // AF Form 931: Section IX; AF Form 932: Section VIII (AFI 36-2406)
  const knowingYourAirmanSection =
    tier === "senior" ? "Section VIII" : "Section IX";
  return {
    formLabel,
    categories: Object.values(rubric) as RubricCategory[],
    knowingYourAirmanSection,
  };
}

function subcategoryBullets(category: RubricCategory, prompt: string): string[] {
  return Object.values(category.subcategories).map(
    (sub) => `- ${sub.label}: ${prompt}`
  );
}

function buildAcaAreaSections(
  categories: RubricCategory[],
  prompt: string,
  headingLevel: "##" | "###" = "##"
): string[] {
  const lines: string[] = [];
  for (const category of categories) {
    lines.push(`${headingLevel} ${category.title}`);
    lines.push(`Focus: ${category.focus}`);
    lines.push(...subcategoryBullets(category, prompt));
    lines.push("");
  }
  return lines;
}

/**
 * Initial ACA session guide aligned to AFI 36-2406 / AF Form 931|932.
 * Initial does NOT complete performance scale sections (VI–VIII on 931);
 * raters outline expectations and run Knowing Your Airman discussion.
 */
function buildInitialTemplate(
  formLabel: string,
  categories: RubricCategory[],
  knowingYourAirmanSection: string
): string {
  const expectationThemes = categories.map((category) => {
    const labels = Object.values(category.subcategories)
      .map((sub) => sub.label)
      .join("; ");
    return [
      `### ${category.title}`,
      `(Themes: ${labels})`,
      "- Standard / expectation:",
      "- How success will be observed this cycle:",
      "",
    ].join("\n");
  });

  return [
    `# Initial ACA — Session Guide (${formLabel})`,
    "Private rater prep for the Initial Airman Comprehensive Assessment.",
    "Aligned to AFI 36-2406: Initial within 60 days of supervision; face-to-face preferred.",
    "Do not mark performance scales on Initial — outline expectations and discuss the Airman.",
    "",
    "## Before the session",
    "- Forward the ACA to the ratee for Section III self-assessment (aim for return 2–3 days prior)",
    "- Review Y/N self-assessment items (Responsibility, Accountability, Air Force Culture, Self)",
    "- Confirm Individual Readiness Index / AEF with the Unit Deployment Manager if needed",
    "",
    "## Airman's critical role in support of the mission (Section IV)",
    "- Primary duties / duty title:",
    "- How this role supports unit mission success:",
    "- Key deliverables expected this cycle:",
    "",
    "## Expectations for this cycle",
    "Write specific, measurable, observable standards (Enlisted Force Structure / grade-appropriate).",
    "These are the standards you will use later to evaluate performance — not ratings yet.",
    "",
    ...expectationThemes,
    "## Self-assessment follow-ups (Section III)",
    "- Items marked N (needs more information) to cover:",
    "- Responsibility / accountability / AF culture points to reinforce:",
    "",
    `## Knowing your Airman (${knowingYourAirmanSection})`,
    "Use as discussion prompts — not an interrogation (AFI 36-2406).",
    "- Personal and professional goals:",
    "- What stresses them / support needed:",
    "- Mentorship (find a mentor / become a mentor):",
    "- Growth expectations I will set (ratee feedback + my expectations):",
    "",
    "## Healthy organizational climate",
    "- Expectations for contributing to a healthy climate (required for SrA and below; NCOs accountable to create it):",
    "",
    "## After the session",
    "- Complete and sign the ACA; provide the original to the ratee; retain a copy",
    "- Point the ratee to MyAirForceBenefits as required",
    "",
  ].join("\n");
}

/**
 * Midterm ACA — midway between supervision start and projected EPR/EPB closeout.
 * Unlike Initial, raters complete performance scale sections (VI–VIII on 931 / VI–VII on 932).
 */
function buildMidtermTemplate(
  formLabel: string,
  categories: RubricCategory[],
  knowingYourAirmanSection: string
): string {
  return [
    `# Midterm ACA — Session Guide (${formLabel})`,
    "Private rater prep for the Midterm Airman Comprehensive Assessment.",
    "Aligned to AFI 36-2406: midway between date supervision began and projected EPR/EPB closeout.",
    "Face-to-face preferred. Complete performance assessment scales (not Initial).",
    "Midterm ACA is routed with the evaluation but is not part of the official record.",
    "Form-prep settings only — Generate Feedback Guide uses assessments to fill the outline brief.",
    "",
    "## Before the session",
    "- Forward the ACA to the ratee for Section III self-assessment (aim for return 2–3 days prior)",
    "- Review Initial expectations and what has changed since then",
    "- Confirm Individual Readiness Index / AEF with the Unit Deployment Manager if needed",
    "",
    "## Airman's critical role in support of the mission (Section IV)",
    "- Primary duties / duty title (update if changed):",
    "- How this role supports unit mission success now:",
    "- Deliverables still owed before closeout:",
    "",
    "## Individual readiness (Section V)",
    "- Readiness status (R = not deployable / G = deployable):",
    "- AEF Indicator:",
    "- Fitness / currency / deployment readiness items to discuss:",
    "",
    "## Performance assessment (mark scales on the form)",
    "Use Does Not Meet / Meets / Exceeds / Far Exceeds (or N/A). Be honest and specific.",
    "Word pictures on the form should match the rating you assign.",
    "",
    ...buildAcaAreaSections(
      categories,
      "Tentative rating focus (evidence comes from Generate)",
      "###"
    ),
    "## Progress vs Initial expectations",
    "- Expectations met / exceeded:",
    "- Expectations not yet met (and why):",
    "- Adjusted standards for the rest of the cycle:",
    "",
    "## Self-assessment follow-ups (Section III)",
    "- Items marked N (needs more information) to cover:",
    "- Responsibility / accountability / AF culture / self points to reinforce:",
    "",
    `## Knowing your Airman (${knowingYourAirmanSection})`,
    "Discussion prompts — not an interrogation (AFI 36-2406).",
    "- Personal and professional goals since Initial:",
    "- Stressors / support needed:",
    "- Mentorship (find a mentor / become a mentor):",
    "- Growth expectations for the remainder of the cycle:",
    "",
    "## Path to a stronger EPB package",
    "- Gaps to close before closeout:",
    "- Evidence still needed (which MPA / verb):",
    "- Developmental asks before Final / EPB writing:",
    "",
    "## After the session",
    "- Complete and sign the Midterm ACA; provide the original to the ratee; retain a copy",
    "- Route Midterm ACA with the EPR/EPB when due (not an official record attachment)",
    "- Point the ratee to MyAirForceBenefits / AF Benefits Fact Sheet as required",
    "",
  ].join("\n");
}

/**
 * End-of-reporting-period feedback (product label: Final).
 * Within 60 days of evaluation closeout: (1) review the period + EPB, (2) set next-cycle expectations.
 */
function buildFinalTemplate(
  formLabel: string,
  categories: RubricCategory[],
  knowingYourAirmanSection: string
): string {
  return [
    `# End-of-Reporting Period ACA — Session Guide (${formLabel})`,
    "Private rater prep for Final / end-of-reporting-period feedback (AFI 36-2406).",
    "Conduct within 60 calendar days of evaluation closeout.",
    "Two purposes: (1) review the reporting period and resulting EPB/EPR; (2) set expectations for the new period.",
    "May use the evaluation that just closed and/or a new ACA worksheet.",
    "Form-prep settings only — Generate Feedback Guide marries the EPB package into the outline brief.",
    "",
    "## Before the session",
    "- Have the signed/closed EPB (or draft narrative) ready to walk through",
    "- Review Midterm ratings vs final package narrative — note any deltas to explain",
    "- Decide whether you will also open a new ACA for next-cycle expectations",
    "",
    "## Purpose 1 — Review the reporting period & EPB",
    "- Overall period narrative (what success looked like):",
    "- How the EPB reflects performance (line by line / MPA highlights):",
    "- Surprises for the ratee to address up front (ratings, wording, omissions):",
    "",
    "## Performance closeout by ACA area",
    ...buildAcaAreaSections(
      categories,
      "Closeout focus (from EPB themes via Generate)",
      "###"
    ),
    "## Package highlights to reinforce",
    "- Strongest EPB statements to acknowledge:",
    "- Areas where the Airman grew this cycle:",
    "",
    "## Development carried forward",
    "- Skills / behaviors to sustain:",
    "- Gaps that remain after closeout:",
    "",
    "## Purpose 2 — Expectations for the new reporting period",
    "If same rater continues, this often doubles as (or feeds) the next Initial.",
    "- Mission role / duty updates for the new period:",
    "- Specific, measurable expectations for the next cycle:",
    "- Early developmental priorities:",
    "",
    `## Knowing your Airman (${knowingYourAirmanSection})`,
    "- Goals for the next period:",
    "- Support / mentorship needed:",
    "- Growth expectations I will set:",
    "",
    "## After the session",
    "- Ratee acknowledges the evaluation per process; document Final ACA if used",
    "- Provide signed materials to the ratee; retain copies as required",
    "- Point the ratee to MyAirForceBenefits / AF Benefits Fact Sheet as required",
    "",
  ].join("\n");
}

export function getFeedbackGuideFormLabel(
  rateeRank: Rank | string | null
): "AF Form 931" | "AF Form 932" {
  return getRubricTierForRank(rateeRank as Rank) === "senior"
    ? "AF Form 932"
    : "AF Form 931";
}

/**
 * Default supervisor Session Guide / settings template for a feedback phase.
 * Initial = expectations guide; Midterm/Final = ACA form-prep settings.
 */
export function getDefaultFeedbackSessionGuide(
  feedbackType: FeedbackType,
  rateeRank: Rank | string | null
): string {
  const { formLabel, categories, knowingYourAirmanSection } =
    getRubricForRank(rateeRank);
  switch (feedbackType) {
    case "initial":
      return buildInitialTemplate(
        formLabel,
        categories,
        knowingYourAirmanSection
      );
    case "midterm":
      return buildMidtermTemplate(
        formLabel,
        categories,
        knowingYourAirmanSection
      );
    case "final":
      return buildFinalTemplate(
        formLabel,
        categories,
        knowingYourAirmanSection
      );
  }
}
