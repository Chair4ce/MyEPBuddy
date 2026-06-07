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

export function formatPct(value: number): string {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export function actionLabel(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    generate: "Generation",
    assess: "Assessments",
    award: "Awards",
    decoration: "Decorations",
    other: "Other",
  };
  return labels[category] ?? category;
}

export function segmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    trial_active: "Trial active",
    purchased: "Purchased credits",
    byok: "BYOK",
    exhausted: "Exhausted (no convert)",
    dormant: "Dormant",
  };
  return labels[segment] ?? segment;
}

export function bucketLabel(bucket: string): string {
  if (bucket === "unused") return "Unused (0)";
  if (bucket === "exhausted (100)") return "Exhausted (100)";
  return `${bucket} trial calls`;
}

export function projectedMonthlyCost(
  costInWindow: number,
  days: number,
): number {
  if (days <= 0) return 0;
  return (costInWindow / days) * 30;
}
