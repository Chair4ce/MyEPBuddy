import { DEFAULT_MPA_DESCRIPTIONS, ENTRY_MGAS } from "@/lib/constants";
import { PORTFOLIO_MISFILE_GAP } from "@/lib/cycle-portfolio";
import type { AccomplishmentAssessmentScores } from "@/types/database";

export const INDICATOR_WEAK_THRESHOLD = 60;

export type QualityIndicatorKey =
  | "action_clarity"
  | "impact_significance"
  | "metrics_quality"
  | "scope_definition";

export interface AssessmentCoachingTip {
  id: QualityIndicatorKey | "misfile" | "strong";
  indicator?: QualityIndicatorKey;
  title: string;
  body: string;
  severity: "weak" | "info" | "strong";
}

export type AssessmentViewerRole = "self" | "rater";

const INDICATOR_TIPS: Record<
  QualityIndicatorKey,
  Pick<AssessmentCoachingTip, "title" | "body">
> = {
  action_clarity: {
    title: "Action clarity",
    body: "Lead with a concrete verb + object. Cut filler so a rater can see exactly what was done in one read.",
  },
  impact_significance: {
    title: "Impact",
    body: "Spell out who benefited and what changed (section, unit, or mission outcome) — not only that the task was finished.",
  },
  metrics_quality: {
    title: "Metrics",
    body: 'Add a baseline → result number (%, count, hours, errors, dollars). Vague "improved" will not carry an EPB bullet.',
  },
  scope_definition: {
    title: "Scope",
    body: "Clarify scale: solo task, team of N, flight/squadron program, or wing-wide.",
  },
};

const QUALITY_INDICATOR_KEYS: QualityIndicatorKey[] = [
  "action_clarity",
  "impact_significance",
  "metrics_quality",
  "scope_definition",
];

function getMpaLabel(mpaKey: string): string {
  return (
    DEFAULT_MPA_DESCRIPTIONS[mpaKey]?.title ??
    ENTRY_MGAS.find((mpa) => mpa.key === mpaKey)?.label ??
    mpaKey
  );
}

function isMisfiled(
  scores: AccomplishmentAssessmentScores,
  selectedMpa: string
): boolean {
  const primary = scores.primary_mpa;
  if (!primary || primary === selectedMpa) return false;

  const primaryScore = scores.mpa_relevancy[primary as keyof typeof scores.mpa_relevancy];
  const selectedScore =
    scores.mpa_relevancy[selectedMpa as keyof typeof scores.mpa_relevancy];

  if (typeof primaryScore !== "number" || typeof selectedScore !== "number") {
    return false;
  }

  return primaryScore - selectedScore >= PORTFOLIO_MISFILE_GAP;
}

export function getAssessmentCoachingTips(
  scores: AccomplishmentAssessmentScores,
  selectedMpa: string
): AssessmentCoachingTip[] {
  const weakTips: AssessmentCoachingTip[] = QUALITY_INDICATOR_KEYS.filter(
    (key) => scores.quality_indicators[key] < INDICATOR_WEAK_THRESHOLD
  )
    .map((key) => ({
      id: key,
      indicator: key,
      title: INDICATOR_TIPS[key].title,
      body: INDICATOR_TIPS[key].body,
      severity: "weak" as const,
      score: scores.quality_indicators[key],
    }))
    .sort((a, b) => a.score - b.score)
    .map(({ score: _score, ...tip }) => tip);

  const tips: AssessmentCoachingTip[] = [...weakTips];

  if (isMisfiled(scores, selectedMpa)) {
    tips.push({
      id: "misfile",
      title: "MPA fit",
      body: `AI Best Fit is ${getMpaLabel(scores.primary_mpa)}, not the selected ${getMpaLabel(selectedMpa)}. Recategorize if the work truly matches that MPA.`,
      severity: "info",
    });
  }

  if (tips.length === 0) {
    tips.push({
      id: "strong",
      title: "Ready for the package",
      body: "Quality indicators clear the bar. Keep numbers tight when drafting the EPB statement from this entry.",
      severity: "strong",
    });
  }

  return tips.slice(0, 4);
}

export function getAssessmentChrome(role: AssessmentViewerRole): {
  sectionLabel: string;
  ctaLabel: string;
  ctaRelabel: string;
  emptyHint: string;
  tipsHeading: string;
} {
  const shared = {
    sectionLabel: "AI Assessment",
    ctaLabel: "Assess entry",
    ctaRelabel: "Re-assess",
  };

  if (role === "rater") {
    return {
      ...shared,
      emptyHint:
        "Assess this entry to score MPA fit and capture feedback notes for the ratee.",
      tipsHeading: "Feedback notes",
    };
  }

  return {
    ...shared,
    emptyHint:
      "Assess this entry to see MPA fit, quality breakdown, and improvement notes.",
    tipsHeading: "Improvement notes",
  };
}
