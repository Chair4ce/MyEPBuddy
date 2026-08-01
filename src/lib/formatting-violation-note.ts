/** Matches optional metadata from POST /api/generate and /api/revise-selection. */
export interface FormattingViolationFlag {
  violations: string[];
  remaining: string[];
  method: string;
  attempts: number;
}

export interface StatementGenerationResult {
  statements: string[];
  formattingViolations?: FormattingViolationFlag[];
}

export function collectFormattingViolationLabels(
  flags: FormattingViolationFlag[]
): string[] {
  const labels = new Set<string>();
  for (const flag of flags) {
    for (const label of flag.violations) {
      if (label) labels.add(label);
    }
  }
  return [...labels];
}

export function hasFormattingRemaining(flags: FormattingViolationFlag[]): boolean {
  return flags.some((flag) => flag.remaining.length > 0);
}

/** Human-readable note for muted UI copy (static text / aria-label). */
export function formatFormattingViolationNote(
  flags: FormattingViolationFlag[]
): string {
  const labels = collectFormattingViolationLabels(flags);
  if (labels.length === 0) return "";

  const labelList = labels.join(", ");
  if (hasFormattingRemaining(flags)) {
    const remaining = [
      ...new Set(flags.flatMap((flag) => flag.remaining).filter(Boolean)),
    ].join(", ");
    return `Auto-fixed banned formatting (${labelList}); some may remain (${remaining})`;
  }

  return `Auto-fixed banned formatting (${labelList})`;
}
