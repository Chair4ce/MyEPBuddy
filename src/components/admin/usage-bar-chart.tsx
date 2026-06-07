import { cn } from "@/lib/utils";

export interface BarChartItem {
  label: string;
  value: number;
  sublabel?: string;
}

export function UsageBarChart({
  items,
  valueFormatter,
  className,
  "aria-label": ariaLabel,
}: {
  items: BarChartItem[];
  valueFormatter?: (value: number) => string;
  className?: string;
  "aria-label"?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const format = valueFormatter ?? String;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No data in this range yet.</p>
    );
  }

  return (
    <div className={cn("space-y-3", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const widthPct = Math.max(2, (item.value / max) * 100);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium truncate">{item.label}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {format(item.value)}
                {item.sublabel ? (
                  <span className="ml-1 text-xs">({item.sublabel})</span>
                ) : null}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${widthPct}%` }}
                role="presentation"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
