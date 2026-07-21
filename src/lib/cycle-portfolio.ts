import { ENTRY_MGAS } from "@/lib/constants";
import type {
  Accomplishment,
  AccomplishmentAssessmentScores,
} from "@/types/database";

export const ACA_PORTFOLIO_MPA_KEYS = [
  "executing_mission",
  "leading_people",
  "managing_resources",
  "improving_unit",
] as const;

export type AcaPortfolioMpaKey = (typeof ACA_PORTFOLIO_MPA_KEYS)[number];

export const PORTFOLIO_QUALITY_FLOOR = 60;
export const PORTFOLIO_METRICS_FLOOR = 50;
export const PORTFOLIO_MISFILE_GAP = 20;

type QualityIndicatorKey =
  | "action_clarity"
  | "impact_significance"
  | "metrics_quality"
  | "scope_definition";

export interface CycleMpaPortfolioStat {
  mpaKey: AcaPortfolioMpaKey;
  entryCount: number;
  assessedCount: number;
  avgOverall: number | null;
  avgRelevancy: number | null;
  avgMetrics: number | null;
  misfiledCount: number;
}

export interface CycleQualityFingerprint {
  assessedEntryCount: number;
  avgOverall: number | null;
  avgActionClarity: number | null;
  avgImpact: number | null;
  avgMetrics: number | null;
  avgScope: number | null;
  weakestIndicator: QualityIndicatorKey | null;
}

export interface CyclePortfolio {
  mpaStats: Record<AcaPortfolioMpaKey, CycleMpaPortfolioStat>;
  fingerprint: CycleQualityFingerprint;
  /** 0–3 short ratee-neutral guidance lines */
  coachingLines: string[];
  volumeReadyMpas: number;
  qualityReadyMpas: number;
  hasAnyAssessments: boolean;
}

const RECOMMENDED_ENTRIES_PER_MPA = 3;

function isAcaMpaKey(mpa: string): mpa is AcaPortfolioMpaKey {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(mpa);
}

function getMpaLabel(mpaKey: AcaPortfolioMpaKey): string {
  return ENTRY_MGAS.find((mpa) => mpa.key === mpaKey)?.label ?? mpaKey;
}

function meanRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isMisfiledEntry(
  entry: Accomplishment,
  mpaKey: AcaPortfolioMpaKey,
  scores: AccomplishmentAssessmentScores
): boolean {
  if (entry.mpa !== mpaKey) return false;

  const primary = scores.primary_mpa;
  if (!isAcaMpaKey(primary) || primary === mpaKey) return false;

  const relevancy = scores.mpa_relevancy;
  return relevancy[primary] - relevancy[mpaKey] >= PORTFOLIO_MISFILE_GAP;
}

function buildFingerprint(
  assessedAcaEntries: Accomplishment[]
): CycleQualityFingerprint {
  if (assessedAcaEntries.length === 0) {
    return {
      assessedEntryCount: 0,
      avgOverall: null,
      avgActionClarity: null,
      avgImpact: null,
      avgMetrics: null,
      avgScope: null,
      weakestIndicator: null,
    };
  }

  const overallScores: number[] = [];
  const actionClarity: number[] = [];
  const impact: number[] = [];
  const metrics: number[] = [];
  const scope: number[] = [];

  for (const entry of assessedAcaEntries) {
    const scores = entry.assessment_scores!;
    overallScores.push(scores.overall_score);
    actionClarity.push(scores.quality_indicators.action_clarity);
    impact.push(scores.quality_indicators.impact_significance);
    metrics.push(scores.quality_indicators.metrics_quality);
    scope.push(scores.quality_indicators.scope_definition);
  }

  const indicatorAverages: { key: QualityIndicatorKey; avg: number }[] = [
    { key: "action_clarity", avg: meanRounded(actionClarity) ?? 0 },
    { key: "impact_significance", avg: meanRounded(impact) ?? 0 },
    { key: "metrics_quality", avg: meanRounded(metrics) ?? 0 },
    { key: "scope_definition", avg: meanRounded(scope) ?? 0 },
  ];

  const weakest = indicatorAverages.reduce((lowest, current) =>
    current.avg < lowest.avg ? current : lowest
  );

  return {
    assessedEntryCount: assessedAcaEntries.length,
    avgOverall: meanRounded(overallScores),
    avgActionClarity: meanRounded(actionClarity),
    avgImpact: meanRounded(impact),
    avgMetrics: meanRounded(metrics),
    avgScope: meanRounded(scope),
    weakestIndicator: weakest.key,
  };
}

function buildCoachingLines(
  mpaStats: Record<AcaPortfolioMpaKey, CycleMpaPortfolioStat>,
  fingerprint: CycleQualityFingerprint,
  hasAnyAssessments: boolean
): string[] {
  const qualityLines: string[] = [];
  const volumeGapLines: string[] = [];
  const partialVolumeLines: string[] = [];

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const stat = mpaStats[mpaKey];
    const label = getMpaLabel(mpaKey);

    if (stat.entryCount === 0) {
      volumeGapLines.push(
        `No ${label} entries yet — add at least one before closeout.`
      );
    } else if (
      stat.assessedCount > 0 &&
      stat.avgOverall !== null &&
      stat.avgOverall < PORTFOLIO_QUALITY_FLOOR
    ) {
      qualityLines.push(
        `${label} average quality is ${stat.avgOverall} — strengthen impact and metrics on those entries.`
      );
    } else if (stat.entryCount < RECOMMENDED_ENTRIES_PER_MPA) {
      partialVolumeLines.push(
        `${label} has ${stat.entryCount}/3 recommended entries.`
      );
    }
  }

  const cycleLines: string[] = [];

  if (
    fingerprint.assessedEntryCount > 0 &&
    fingerprint.avgMetrics !== null &&
    fingerprint.avgMetrics < PORTFOLIO_METRICS_FLOOR
  ) {
    cycleLines.push(
      `Cycle-wide metrics are the weak spot (avg ${fingerprint.avgMetrics}). Prefer baseline → result numbers.`
    );
  }

  const totalMisfiled = ACA_PORTFOLIO_MPA_KEYS.reduce(
    (sum, key) => sum + mpaStats[key].misfiledCount,
    0
  );
  if (totalMisfiled > 0) {
    cycleLines.push(
      `${totalMisfiled} ${totalMisfiled === 1 ? "entry" : "entries"} may be miscategorized — compare AI Best Fit to the tagged MPA.`
    );
  }

  const allFourHaveOneEntry = ACA_PORTFOLIO_MPA_KEYS.every(
    (key) => mpaStats[key].entryCount >= 1
  );

  const positiveLines: string[] = [];
  if (
    qualityLines.length === 0 &&
    cycleLines.length === 0 &&
    volumeGapLines.length === 0 &&
    hasAnyAssessments &&
    allFourHaveOneEntry
  ) {
    positiveLines.push(
      "Solid MPA coverage — keep logging quantified wins through closeout."
    );
  }

  return [
    ...qualityLines,
    ...cycleLines,
    ...volumeGapLines,
    ...positiveLines,
    ...partialVolumeLines,
  ].slice(0, 3);
}

export function buildCyclePortfolio(entries: Accomplishment[]): CyclePortfolio {
  const acaEntries = entries.filter((entry) => isAcaMpaKey(entry.mpa));
  const assessedAcaEntries = acaEntries.filter(
    (entry) => entry.assessment_scores !== null
  );
  const hasAnyAssessments = assessedAcaEntries.length > 0;

  const mpaStats = {} as Record<AcaPortfolioMpaKey, CycleMpaPortfolioStat>;

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const taggedEntries = acaEntries.filter((entry) => entry.mpa === mpaKey);
    const assessedTagged = taggedEntries.filter(
      (entry) => entry.assessment_scores !== null
    );

    const overallScores: number[] = [];
    const relevancyScores: number[] = [];
    const metricsScores: number[] = [];
    let misfiledCount = 0;

    for (const entry of assessedTagged) {
      const scores = entry.assessment_scores!;
      overallScores.push(scores.overall_score);
      relevancyScores.push(scores.mpa_relevancy[mpaKey]);
      metricsScores.push(scores.quality_indicators.metrics_quality);

      if (isMisfiledEntry(entry, mpaKey, scores)) {
        misfiledCount++;
      }
    }

    mpaStats[mpaKey] = {
      mpaKey,
      entryCount: taggedEntries.length,
      assessedCount: assessedTagged.length,
      avgOverall: meanRounded(overallScores),
      avgRelevancy: meanRounded(relevancyScores),
      avgMetrics: meanRounded(metricsScores),
      misfiledCount,
    };
  }

  const fingerprint = buildFingerprint(assessedAcaEntries);

  const volumeReadyMpas = ACA_PORTFOLIO_MPA_KEYS.filter(
    (key) => mpaStats[key].entryCount >= RECOMMENDED_ENTRIES_PER_MPA
  ).length;

  const qualityReadyMpas = ACA_PORTFOLIO_MPA_KEYS.filter(
    (key) =>
      mpaStats[key].assessedCount > 0 &&
      mpaStats[key].avgOverall !== null &&
      mpaStats[key].avgOverall! >= PORTFOLIO_QUALITY_FLOOR
  ).length;

  const coachingLines = buildCoachingLines(
    mpaStats,
    fingerprint,
    hasAnyAssessments
  );

  return {
    mpaStats,
    fingerprint,
    coachingLines,
    volumeReadyMpas,
    qualityReadyMpas,
    hasAnyAssessments,
  };
}
