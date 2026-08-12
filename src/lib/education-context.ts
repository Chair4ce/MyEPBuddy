/**
 * Optional education context on accomplishments.
 * Action/details remain mission work; this metadata ties schooling to that work.
 */

import type { EducationContext } from "@/types/database";

export type { EducationContext };
export type EducationCreditUnit = NonNullable<EducationContext["unit"]>;

export const EDUCATION_CREDIT_UNITS: {
  value: EducationCreditUnit;
  label: string;
}[] = [
  { value: "credit_hours", label: "Credit hours" },
  { value: "semester_hours", label: "Semester hours" },
  { value: "contact_hours", label: "Contact hours" },
];

export const EMPTY_EDUCATION_CONTEXT: EducationContext = {
  program: "",
};

export function hasEducationContext(
  value: EducationContext | null | undefined
): boolean {
  return !!value?.program?.trim();
}

/** Normalize DB/API JSON into a safe EducationContext or null when empty. */
export function normalizeEducationContext(
  raw: unknown
): EducationContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const program =
    typeof obj.program === "string" ? obj.program.trim().slice(0, 200) : "";
  if (!program) return null;

  let credits: number | undefined;
  if (typeof obj.credits === "number" && Number.isFinite(obj.credits) && obj.credits > 0) {
    credits = Math.min(obj.credits, 999);
  } else if (typeof obj.credits === "string" && obj.credits.trim()) {
    const parsed = Number(obj.credits);
    if (Number.isFinite(parsed) && parsed > 0) {
      credits = Math.min(parsed, 999);
    }
  }

  const unitRaw = obj.unit;
  const unit: EducationCreditUnit | undefined =
    credits != null &&
    (unitRaw === "credit_hours" ||
      unitRaw === "semester_hours" ||
      unitRaw === "contact_hours")
      ? unitRaw
      : credits != null
        ? "credit_hours"
        : undefined;

  const completed_date =
    typeof obj.completed_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.completed_date)
      ? obj.completed_date
      : undefined;

  return {
    program,
    ...(credits != null ? { credits } : {}),
    ...(unit ? { unit } : {}),
    ...(completed_date ? { completed_date } : {}),
  };
}

/** Sanitize form values before persist; returns null when program empty. */
export function sanitizeEducationContext(
  value: EducationContext | null | undefined
): EducationContext | null {
  return normalizeEducationContext(value ?? null);
}

export function formatEducationContextForPrompt(
  value: EducationContext | null | undefined
): string {
  const n = normalizeEducationContext(value ?? null);
  if (!n) return "";
  const unitLabel =
    EDUCATION_CREDIT_UNITS.find((u) => u.value === n.unit)?.label ??
    "credit hours";
  const creditPart =
    n.credits != null
      ? ` (${n.credits} ${unitLabel.toLowerCase()})`
      : "";
  const datePart = n.completed_date ? `; completed ${n.completed_date}` : "";
  return `Education context: ${n.program}${creditPart}${datePart}. Action/details describe mission application of this education; impact should tie education to mission results.`;
}

export function educationContextSummary(
  value: EducationContext | null | undefined
): string | null {
  const n = normalizeEducationContext(value ?? null);
  if (!n) return null;
  if (n.credits != null) {
    const unit =
      n.unit === "semester_hours"
        ? "SH"
        : n.unit === "contact_hours"
          ? "hrs"
          : "cr";
    return `${n.program} (${n.credits} ${unit})`;
  }
  return n.program;
}
