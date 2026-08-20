export const RANGE_OPTIONS: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

const intFormatter = new Intl.NumberFormat("en-US");

export function formatInt(value: number): string {
  return intFormatter.format(Math.round(value ?? 0));
}

export function formatCost(value: number): string {
  const amount = Number(value ?? 0);
  const maximumFractionDigits = amount > 0 && amount < 0.01 ? 6 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
}

const ACTION_LABELS: Record<string, string> = {
  synonyms: "Synonym suggestions",
  revise_expand: "Expand",
  revise_compress: "Compress",
  revise_rephrase: "Rephrase",
  revise_selection: "Phrase revise",
  generate: "Generate statements",
  plan_epb: "Plan EPB",
  generate_war: "Generate WAR",
  generate_award: "Generate award",
  generate_decoration: "Generate decoration",
  generate_slot_statement: "Slot statement",
  assess_epb: "Assess EPB",
  assess_accomplishment: "Assess accomplishment",
  assess_accomplishment_preview: "Accomplishment preview",
  generate_feedback_talking_points: "Feedback talking points",
  generate_feedback_session_guide: "Session guide",
  revise_feedback_session_guide: "Revise session guide",
  parse_bulk_statements: "Parse bulk statements",
  extract_accomplishments: "Extract accomplishments",
  adapt_sentence: "Adapt sentence",
  combine: "Combine",
  combine_statements: "Combine statements",
  convert_sentences: "Convert sentences",
  feedback_apply: "Apply feedback",
};

/** Always-visible writing-assist rows on /admin/usage (even at zero). */
export const WRITING_ASSIST_ACTIONS = [
  "synonyms",
  "revise_expand",
  "revise_compress",
  "revise_rephrase",
] as const;

export type WritingAssistAction = (typeof WRITING_ASSIST_ACTIONS)[number];

export function formatUsageActionLabel(actionType: string): string {
  const known = ACTION_LABELS[actionType];
  if (known) return known;
  return actionType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isWritingAssistAction(actionType: string): boolean {
  return (WRITING_ASSIST_ACTIONS as readonly string[]).includes(actionType);
}

export function projectedMonthlyCost(
  costInWindow: number,
  days: number,
): number {
  if (days <= 0) return 0;
  return (costInWindow / days) * 30;
}
