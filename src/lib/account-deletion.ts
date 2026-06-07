export const ACCOUNT_EXIT_REASONS = [
  { value: "not_using", label: "I'm not using it anymore" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "found_alternative", label: "Found another tool" },
  { value: "privacy_concerns", label: "Privacy concerns" },
  { value: "too_complicated", label: "Too complicated to use" },
  { value: "other", label: "Other" },
] as const;

export type AccountExitReason = (typeof ACCOUNT_EXIT_REASONS)[number]["value"];

const VALID_REASONS = new Set<string>(ACCOUNT_EXIT_REASONS.map((r) => r.value));

export function isValidExitReason(value: string | undefined | null): value is AccountExitReason {
  return typeof value === "string" && VALID_REASONS.has(value);
}

export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export function sanitizeComments(raw: string | undefined | null, maxLength = 2000): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = stripHtml(raw).trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}
