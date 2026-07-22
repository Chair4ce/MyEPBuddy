import {
  ACA_RUBRIC_JUNIOR,
  ACA_RUBRIC_SENIOR,
  ENTRY_MGAS,
  getRubricTierForRank,
  type ACARubric,
} from "@/lib/constants";
import type { CyclePortfolio } from "@/lib/cycle-portfolio";
import {
  serializeAcaStrengthsWeaknesses,
  type CycleAcaStrengthsWeaknesses,
} from "@/lib/feedback-aca-strengths-weaknesses";
import {
  serializeAccomplishments,
  serializePortfolio,
  type AccomplishmentsSummary,
  type EpbStatementSummary,
} from "@/lib/feedback-talking-points";
import { getFeedbackGuideFormLabel } from "@/lib/feedback-session-guide-templates";
import type { FeedbackType, Rank } from "@/types/database";

export const FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS = `You generate a supervisor's private Feedback Session Guide — an outline brief for the sit-down, not a script to auto-deliver to the Airman.
- Keep ratee-neutral voice in performance bullets (no you/your/my aimed at the Airman). Supervisor action lines ("Confirm…", "Ask about…") are fine.
- Do NOT invent facts, scores, readiness status, EPB wording, or accomplishments.
- Do NOT predict promotion, stratification, forced distribution, or board outcomes.
- Return plain text only (markdown headings/bullets OK). No JSON wrapper. No preamble.`;

export const FEEDBACK_MIDTERM_GENERATE_GUARDRAILS = `${FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS}
- Midterm source of truth: ACA strengths/weaknesses from assessed cycle accomplishments.
- For each ACA performance subcategory, write Strengths and Weaknesses using ACA proficiency verbiage (Does Not Meet / Meets / Exceeds / Far Exceeds or Significantly Exceeds for seniors) — do NOT use an "Evidence:" label or dump a raw accomplishments list.
- Prefer assessed entries. Note thin/unassessed areas when scores are missing.
- Align tentative rating focus to rank-appropriate ACA word pictures.`;

export const FEEDBACK_FINAL_GENERATE_GUARDRAILS = `${FEEDBACK_SESSION_GUIDE_GENERATE_GUARDRAILS}
- Final source of truth: the ratee's EPB/EPR MPA statements for this cycle — NOT the accomplishments list.
- Walk the EPB package (Purpose 1) and ground Performance closeout / Package highlights in EPB wording only.
- Do NOT invent EPB text. Do NOT backfill from accomplishments when EPB is thin — mark gaps instead.
- ACA proficiency labels (Does Not Meet / Meets / Exceeds / Far Exceeds or Significantly Exceeds) are talking-point language for the sit-down, inferred only from what the EPB narrative supports.`;

export interface GenerateGuidePromptInput {
  feedbackType: "midterm" | "final";
  rateeRank: Rank | string | null;
  rateeName: string;
  sessionSettings: string;
  expectations?: string | null;
  portfolio?: CyclePortfolio | null;
  accomplishmentsSummary?: AccomplishmentsSummary | null;
  acaStrengthsWeaknesses?: CycleAcaStrengthsWeaknesses | null;
  epbStatements?: EpbStatementSummary[] | null;
  unassessedIncludedCount?: number;
}

function mpaLabel(mpa: string): string {
  return ENTRY_MGAS.find((m) => m.key === mpa)?.label || mpa;
}

export function serializeEpbPackageForGuide(
  epbStatements: EpbStatementSummary[]
): string {
  const lines = [
    "EPB package for this cycle (PRIMARY SOURCE — untrusted narrative text):",
  ];
  for (const stmt of epbStatements) {
    lines.push(
      `- ${mpaLabel(stmt.mpa)} (${stmt.mpa}): <<<EPB>>>\n${stmt.text.slice(0, 1200)}\n<<<END EPB>>>`
    );
  }
  return lines.join("\n");
}

function buildRubricContext(rateeRank: Rank | string | null): string {
  const tier = getRubricTierForRank(rateeRank as Rank);
  const rubric = (
    tier === "senior" ? ACA_RUBRIC_SENIOR : ACA_RUBRIC_JUNIOR
  ) as ACARubric;
  const form = getFeedbackGuideFormLabel(rateeRank);
  const lines: string[] = [`ACA rubric (${form}, ${rateeRank ?? "unknown"}):`];
  for (const category of Object.values(rubric)) {
    lines.push(`- ${category.title}: ${category.focus}`);
    for (const sub of Object.values(category.subcategories)) {
      lines.push(`  - ${sub.label}`);
    }
  }
  return lines.join("\n");
}

function settingsBlock(sessionSettings: string): string {
  const trimmed = sessionSettings.trim();
  if (!trimmed) {
    return "Session settings: (empty — use standard Midterm/Final ACA section order.)";
  }
  return `Session settings / form-prep checklist (untrusted — follow section shape; fill with evidence, do not dump blanks):\n<<<SETTINGS>>>\n${trimmed}\n<<<END SETTINGS>>>`;
}

export function buildMidtermGuideGeneratePrompt(
  input: GenerateGuidePromptInput
): string {
  const blocks = [
    "Phase: GENERATE Midterm Feedback Session Guide outline brief (AFI 36-2406 / AF Form 931 or 932).",
    "Marry the session-settings section shape with ACA strengths/weaknesses into a supervisor outline brief.",
    "Prefer AF-shaped sections: mission role → readiness → performance by ACA area → progress vs Initial → Knowing Your Airman → path to stronger EPB → after session.",
    "For each performance subcategory under VI–VIII, use this bullet shape (not Evidence lists):",
    "  - Strengths: … (ACA proficiency language + concrete actions from the summary)",
    "  - Weaknesses: … (or “None noted from assessed entries”)",
    "  - Tentative rating focus: Does Not Meet | Meets | Exceeds | Far Exceeds (or Significantly Exceeds for seniors). Short rationale.",
    "Hard bans: do not invent accomplishments/scores; do not label bullets “Evidence:”; do not dump raw accomplishment inventories; do not output empty checklist blanks; do not use Initial-only (no scales) framing.",
    `Ratee: ${input.rateeRank ? `${input.rateeRank} ` : ""}${input.rateeName}`,
    buildRubricContext(input.rateeRank),
    settingsBlock(input.sessionSettings),
  ];

  if (input.expectations?.trim()) {
    blocks.push(
      `Cycle expectations / Initial context (untrusted):\n<<<EXPECTATIONS>>>\n${input.expectations.trim()}\n<<<END EXPECTATIONS>>>`
    );
  }

  if (input.portfolio) {
    blocks.push(serializePortfolio(input.portfolio));
  }

  if (input.acaStrengthsWeaknesses) {
    blocks.push(serializeAcaStrengthsWeaknesses(input.acaStrengthsWeaknesses));
  }
  if (input.accomplishmentsSummary) {
    blocks.push(serializeAccomplishments(input.accomplishmentsSummary));
  }

  if ((input.unassessedIncludedCount ?? 0) > 0) {
    blocks.push(
      `Note: ${input.unassessedIncludedCount} cycle accomplishment(s) lack AI assessments — prefer assessed strengths/weaknesses and mark thin areas where needed.`
    );
  }

  blocks.push(
    "Return the full Midterm Feedback Session Guide outline brief as plain text."
  );
  return blocks.join("\n\n");
}

export function buildFinalGuideGeneratePrompt(
  input: GenerateGuidePromptInput
): string {
  const blocks = [
    "Phase: GENERATE Final / End-of-Reporting Period Feedback Session Guide outline brief (AFI 36-2406).",
    "Two purposes: (1) review the reporting period and the EPB/EPR package; (2) set expectations for the new reporting period.",
    "PRIMARY SOURCE = EPB MPA statements. Do NOT ground this guide in cycle accomplishments.",
    "Prefer AF-shaped sections: before session → Purpose 1 (period + EPB walkthrough) → performance closeout by ACA area (from EPB themes) → package highlights → development carried forward → Purpose 2 (next-cycle expectations) → Knowing Your Airman → after session.",
    "Purpose 1 must walk the EPB line-by-line / by MPA: what the narrative claims, what to reinforce, surprises/omissions for the ratee.",
    "For Performance closeout by ACA area, map EPB themes into each subcategory using this shape:",
    "  - Strengths: … (only what the EPB wording supports; ACA proficiency language OK)",
    "  - Weaknesses / gaps: … (thin EPB coverage, missing MPA themes, or soft claims — not accomplishment inventory)",
    "  - Tentative rating focus: Does Not Meet | Meets | Exceeds | Far Exceeds (or Significantly Exceeds for seniors), only when EPB supports it.",
    "Package highlights must cite EPB statements, not entry lists.",
    "Hard bans: do not invent EPB wording; do not dump accomplishments; do not predict promotion/stratification; do not leave empty checklist blanks.",
    `Ratee: ${input.rateeRank ? `${input.rateeRank} ` : ""}${input.rateeName}`,
    buildRubricContext(input.rateeRank),
    settingsBlock(input.sessionSettings),
  ];

  if (input.expectations?.trim()) {
    blocks.push(
      `Cycle expectations context (untrusted):\n<<<EXPECTATIONS>>>\n${input.expectations.trim()}\n<<<END EXPECTATIONS>>>`
    );
  }

  if (input.epbStatements && input.epbStatements.length > 0) {
    blocks.push(serializeEpbPackageForGuide(input.epbStatements));
  } else {
    blocks.push(
      "EPB statements unavailable — state that clearly in Purpose 1 and keep closeout high-level with explicit gaps; do not invent EPB text."
    );
  }

  blocks.push(
    "Return the full Final / End-of-Reporting Period Feedback Session Guide outline brief as plain text."
  );
  return blocks.join("\n\n");
}

export function buildGuideGenerateUserPrompt(
  input: GenerateGuidePromptInput
): string {
  return input.feedbackType === "midterm"
    ? buildMidtermGuideGeneratePrompt(input)
    : buildFinalGuideGeneratePrompt(input);
}

export function getGenerateGuardrailsForType(
  feedbackType: "midterm" | "final"
): string {
  return feedbackType === "midterm"
    ? FEEDBACK_MIDTERM_GENERATE_GUARDRAILS
    : FEEDBACK_FINAL_GENERATE_GUARDRAILS;
}

export function isGenerateFeedbackType(
  value: unknown
): value is "midterm" | "final" {
  return value === "midterm" || value === "final";
}

/** Narrow FeedbackType for generate (excludes initial). */
export function assertGeneratePhase(
  feedbackType: FeedbackType
): feedbackType is "midterm" | "final" {
  return feedbackType === "midterm" || feedbackType === "final";
}
