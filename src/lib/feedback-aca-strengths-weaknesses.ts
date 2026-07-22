import {
  ACA_JUNIOR_PROFICIENCY_LEVELS,
  ACA_SENIOR_PROFICIENCY_LEVELS,
  ENTRY_MGAS,
  getRubricTierForRank,
} from "@/lib/constants";
import type {
  Accomplishment,
  AccomplishmentAssessmentScores,
  Rank,
} from "@/types/database";

/**
 * Bands from `/api/assess-accomplishment` quality-indicator scoring:
 * Does Not Meet=0-25, Meets=26-60, Exceeds=61-80, Far/Significantly Exceeds=81-100
 */
export function scoreToAcaProficiencyLabel(
  score: number,
  rateeRank: Rank | string | null
): string {
  const senior = getRubricTierForRank(rateeRank as Rank) === "senior";
  const topLabel = senior ? "Significantly Exceeds" : "Far Exceeds";
  if (score <= 25) return "Does Not Meet";
  if (score <= 60) return "Meets";
  if (score <= 80) return "Exceeds";
  return topLabel;
}

export function isAcaStrengthScore(score: number): boolean {
  return score >= 61;
}

export interface AcaStrengthWeaknessItem {
  id: string;
  date: string;
  actionVerb: string;
  summary: string;
  mpaLabel: string;
  overallScore: number;
  proficiencyLabel: string;
  weakestIndicatorLabel: string | null;
}

export interface CycleAcaStrengthsWeaknesses {
  formLabel: "AF Form 931" | "AF Form 932";
  strengths: AcaStrengthWeaknessItem[];
  weaknesses: AcaStrengthWeaknessItem[];
  unassessedCount: number;
  assessedCount: number;
}

const INDICATOR_LABELS: Record<string, string> = {
  action_clarity: "Action clarity",
  impact_significance: "Impact significance",
  metrics_quality: "Metrics quality",
  scope_definition: "Scope definition",
};

function mpaLabel(mpa: string): string {
  return ENTRY_MGAS.find((m) => m.key === mpa)?.label || mpa;
}

function summarizeEntry(entry: Accomplishment): string {
  const verb = entry.action_verb?.trim() || "Entry";
  const details = entry.details?.trim() || "";
  const body = details.length > 120 ? `${details.slice(0, 119)}…` : details;
  return body ? `${verb} — ${body}` : verb;
}

function weakestIndicator(
  scores: AccomplishmentAssessmentScores
): string | null {
  const indicators = scores.quality_indicators;
  if (!indicators) return null;
  let weakestKey: string | null = null;
  let weakestScore = Infinity;
  for (const [key, value] of Object.entries(indicators)) {
    if (typeof value !== "number") continue;
    if (value < weakestScore) {
      weakestScore = value;
      weakestKey = key;
    }
  }
  if (weakestKey == null || weakestScore >= 61) return null;
  return INDICATOR_LABELS[weakestKey] ?? weakestKey;
}

function toItem(
  entry: Accomplishment,
  rateeRank: Rank | string | null
): AcaStrengthWeaknessItem | null {
  const overall = entry.assessment_scores?.overall_score;
  if (typeof overall !== "number" || !entry.assessment_scores) return null;
  return {
    id: entry.id,
    date: entry.date,
    actionVerb: entry.action_verb?.trim() || "Entry",
    summary: summarizeEntry(entry),
    mpaLabel: mpaLabel(entry.mpa),
    overallScore: overall,
    proficiencyLabel: scoreToAcaProficiencyLabel(overall, rateeRank),
    weakestIndicatorLabel: weakestIndicator(entry.assessment_scores),
  };
}

/**
 * Cycle strengths / weaknesses from stored accomplishment assessments,
 * labeled with the same ACA proficiency bands used when scoring entries.
 */
export function buildCycleAcaStrengthsWeaknesses(
  entries: Array<
    Pick<
      Accomplishment,
      | "id"
      | "date"
      | "action_verb"
      | "details"
      | "mpa"
      | "assessment_scores"
    >
  >,
  rateeRank: Rank | string | null
): CycleAcaStrengthsWeaknesses {
  const tier = getRubricTierForRank(rateeRank as Rank);
  const formLabel = tier === "senior" ? "AF Form 932" : "AF Form 931";
  const strengths: AcaStrengthWeaknessItem[] = [];
  const weaknesses: AcaStrengthWeaknessItem[] = [];
  let unassessedCount = 0;

  for (const entry of entries) {
    const item = toItem(entry as Accomplishment, rateeRank);
    if (!item) {
      unassessedCount += 1;
      continue;
    }
    if (isAcaStrengthScore(item.overallScore)) {
      strengths.push(item);
    } else {
      weaknesses.push(item);
    }
  }

  strengths.sort((a, b) => b.overallScore - a.overallScore);
  weaknesses.sort((a, b) => a.overallScore - b.overallScore);

  return {
    formLabel,
    strengths,
    weaknesses,
    unassessedCount,
    assessedCount: strengths.length + weaknesses.length,
  };
}

export function getAcaProficiencyDescription(
  label: string,
  rateeRank: Rank | string | null
): string {
  const senior = getRubricTierForRank(rateeRank as Rank) === "senior";
  const levels = senior
    ? ACA_SENIOR_PROFICIENCY_LEVELS
    : ACA_JUNIOR_PROFICIENCY_LEVELS;
  return levels.find((l) => l.label === label)?.description ?? "";
}

/** Compact text block for generate prompts. */
export function serializeAcaStrengthsWeaknesses(
  summary: CycleAcaStrengthsWeaknesses
): string {
  const lines = [
    `ACA strengths & weaknesses (${summary.formLabel}) — proficiency bands match accomplishment AI assessment scoring:`,
    `Assessed: ${summary.assessedCount} · Unassessed: ${summary.unassessedCount}`,
    "",
    "## Strengths (Exceeds / Far Exceeds / Significantly Exceeds)",
  ];
  if (summary.strengths.length === 0) {
    lines.push("- None assessed at Exceeds or above yet.");
  } else {
    for (const item of summary.strengths.slice(0, 12)) {
      lines.push(
        `- [${item.proficiencyLabel} · ${item.overallScore}] ${item.summary} (${item.mpaLabel})`
      );
    }
  }
  lines.push("", "## Weaknesses / Needs work (Does Not Meet / Meets)");
  if (summary.weaknesses.length === 0) {
    lines.push("- None assessed below Exceeds.");
  } else {
    for (const item of summary.weaknesses.slice(0, 12)) {
      const weak = item.weakestIndicatorLabel
        ? ` · thin: ${item.weakestIndicatorLabel}`
        : "";
      lines.push(
        `- [${item.proficiencyLabel} · ${item.overallScore}${weak}] ${item.summary} (${item.mpaLabel})`
      );
    }
  }
  return lines.join("\n");
}
