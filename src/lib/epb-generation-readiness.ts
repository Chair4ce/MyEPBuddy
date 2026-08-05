import { ENTRY_MGAS, isEnlisted } from "@/lib/constants";
import {
  ACA_PORTFOLIO_MPA_KEYS,
  PORTFOLIO_QUALITY_FLOOR,
  buildCyclePortfolio,
  type AcaPortfolioMpaKey,
} from "@/lib/cycle-portfolio";
import { isAssessmentStale } from "@/lib/assessment-coaching";
import { isSubstantialEpbStatement } from "@/lib/fuse-to-epb";
import type { Accomplishment, EPBShellSection, Rank } from "@/types/database";

/**
 * Gate + guidance for the one-shot "Generate EPB" flow.
 *
 * This is intentionally content-based (not "1-2 selected per MPA"): the LLM
 * planning step decides the real per-sentence selection and combinations. Here
 * we only stop obviously-too-thin runs and surface non-blocking cautions.
 */

/** At least this many core MPAs must have >= 1 entry to attempt a full EPB. */
export const MIN_ELIGIBLE_MPAS = 2;
/** At least this many ACA-tagged entries across the cycle. */
export const MIN_TOTAL_ACA_ENTRIES = 3;

export interface MpaReadiness {
  mpaKey: AcaPortfolioMpaKey;
  label: string;
  entryCount: number;
  assessedCount: number;
  /** Has at least one entry to generate from. */
  hasContent: boolean;
  /** Assessed and averaging at/above the portfolio quality floor. */
  isStrong: boolean;
}

export interface EpbGenerationReadiness {
  /** Overall gate for showing/enabling the Generate EPB action. */
  canGenerate: boolean;
  /** Blocking reasons (ratee-neutral) when canGenerate is false. */
  reasons: string[];
  /** Non-blocking cautions worth surfacing before generation. */
  warnings: string[];
  perMpa: Record<AcaPortfolioMpaKey, MpaReadiness>;
  /** Core MPAs that have at least one entry (what we will generate). */
  eligibleMpaKeys: AcaPortfolioMpaKey[];
  totalAcaEntries: number;
  assessedCount: number;
  unassessedCount: number;
  staleCount: number;
}

export interface ReadinessOptions {
  /** Ratee rank; when provided, non-enlisted ratees are gated out (v1 is EPB-only). */
  rank?: Rank | string | null;
}

function labelFor(mpaKey: AcaPortfolioMpaKey): string {
  return ENTRY_MGAS.find((m) => m.key === mpaKey)?.label ?? mpaKey;
}

function isAcaEntry(entry: Accomplishment): boolean {
  return (ACA_PORTFOLIO_MPA_KEYS as readonly string[]).includes(entry.mpa);
}

export function evaluateEpbGenerationReadiness(
  entries: Accomplishment[],
  options: ReadinessOptions = {}
): EpbGenerationReadiness {
  const portfolio = buildCyclePortfolio(entries);
  const acaEntries = entries.filter(isAcaEntry);

  const perMpa = {} as Record<AcaPortfolioMpaKey, MpaReadiness>;
  const eligibleMpaKeys: AcaPortfolioMpaKey[] = [];

  for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
    const stat = portfolio.mpaStats[mpaKey];
    const isStrong =
      stat.assessedCount > 0 &&
      stat.avgOverall !== null &&
      stat.avgOverall >= PORTFOLIO_QUALITY_FLOOR;

    perMpa[mpaKey] = {
      mpaKey,
      label: labelFor(mpaKey),
      entryCount: stat.entryCount,
      assessedCount: stat.assessedCount,
      hasContent: stat.entryCount > 0,
      isStrong,
    };

    if (stat.entryCount > 0) {
      eligibleMpaKeys.push(mpaKey);
    }
  }

  let unassessedCount = 0;
  let staleCount = 0;
  for (const entry of acaEntries) {
    if (entry.assessment_scores === null) {
      unassessedCount++;
    } else if (isAssessmentStale(entry.assessed_at, entry.updated_at)) {
      staleCount++;
    }
  }
  const assessedCount = acaEntries.length - unassessedCount;

  const reasons: string[] = [];

  const rankProvided =
    options.rank !== undefined && options.rank !== null && options.rank !== "";
  if (rankProvided && !isEnlisted(options.rank!)) {
    reasons.push(
      "Full EPB generation is available for enlisted ratees only right now."
    );
  }

  if (acaEntries.length < MIN_TOTAL_ACA_ENTRIES) {
    reasons.push(
      `Add at least ${MIN_TOTAL_ACA_ENTRIES} accomplishments this cycle before generating a full EPB (currently ${acaEntries.length}).`
    );
  }

  if (eligibleMpaKeys.length < MIN_ELIGIBLE_MPAS) {
    reasons.push(
      `Cover at least ${MIN_ELIGIBLE_MPAS} performance areas before generating (currently ${eligibleMpaKeys.length}).`
    );
  }

  const warnings: string[] = [];
  const emptyMpas = ACA_PORTFOLIO_MPA_KEYS.filter(
    (key) => perMpa[key].entryCount === 0
  );
  if (emptyMpas.length > 0) {
    warnings.push(
      `No entries for ${emptyMpas
        .map((key) => perMpa[key].label)
        .join(", ")} — ${
        emptyMpas.length === 1 ? "that section" : "those sections"
      } will be left blank.`
    );
  }

  if (unassessedCount > 0) {
    warnings.push(
      `${unassessedCount} ${
        unassessedCount === 1 ? "entry has" : "entries have"
      } no AI assessment yet — they can still be used, but scoring won't guide selection.`
    );
  }

  if (staleCount > 0) {
    warnings.push(
      `${staleCount} ${
        staleCount === 1 ? "entry was" : "entries were"
      } edited after assessment — re-assess for the most accurate selection.`
    );
  }

  return {
    canGenerate: reasons.length === 0,
    reasons,
    warnings,
    perMpa,
    eligibleMpaKeys,
    totalAcaEntries: acaEntries.length,
    assessedCount,
    unassessedCount,
    staleCount,
  };
}

/**
 * MPA keys whose shell section already holds a real statement worth protecting.
 * Drives the overwrite-vs-stage prompt before a full generation writes sections.
 */
export function getMpasWithExistingStatements(
  sections: Pick<EPBShellSection, "mpa" | "statement_text">[]
): string[] {
  return sections
    .filter((s) => isSubstantialEpbStatement(s.statement_text))
    .map((s) => s.mpa);
}
