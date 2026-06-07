import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost_usd: number;
}

export interface ModelBreakdown {
  model_id: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface ActionBreakdown {
  action_type: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface DayBreakdown {
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface UserBreakdown {
  user_id: string;
  email: string | null;
  full_name: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface DefaultKeyUsageData {
  since: string;
  days: number;
  totals: UsageTotals;
  all_time: Pick<UsageTotals, "calls" | "input_tokens" | "output_tokens" | "estimated_cost_usd">;
  by_model: ModelBreakdown[];
  by_action: ActionBreakdown[];
  by_day: DayBreakdown[];
  top_users: UserBreakdown[];
}

const RANGE_OPTIONS: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

const intFormatter = new Intl.NumberFormat("en-US");

function formatInt(value: number): string {
  return intFormatter.format(Math.round(value ?? 0));
}

function formatCost(value: number): string {
  const amount = Number(value ?? 0);
  // Costs can be fractions of a cent; show enough precision without noise.
  const maximumFractionDigits = amount > 0 && amount < 0.01 ? 6 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
}

function ACTION_LABELS(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DefaultKeyUsageDashboard({
  data,
}: {
  data: DefaultKeyUsageData;
}) {
  const { totals, all_time, by_model, by_action, by_day, top_users } = data;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="size-6" />
            Default Key Token Usage
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Token consumption and estimated cost for the free, app-hosted API
            key (used by members without their own key). Costs are estimates
            based on the catalog pricing snapshot at call time.
          </p>
        </div>
        <nav
          className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
          aria-label="Time range"
        >
          {RANGE_OPTIONS.map((option) => {
            const isActive = option.days === data.days;
            return (
              <Link
                key={option.days}
                href={`/admin/usage?days=${option.days}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        aria-label="Usage totals for selected range"
      >
        <SummaryCard label="AI calls" value={formatInt(totals.calls)} />
        <SummaryCard
          label="Input tokens"
          value={formatInt(totals.input_tokens)}
          hint={
            totals.cached_input_tokens
              ? `${formatInt(totals.cached_input_tokens)} cached`
              : undefined
          }
        />
        <SummaryCard
          label="Output tokens"
          value={formatInt(totals.output_tokens)}
        />
        <SummaryCard
          label="Est. cost"
          value={formatCost(totals.estimated_cost_usd)}
          hint={`${formatCost(all_time.estimated_cost_usd)} all-time`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>By model</CardTitle>
          <CardDescription>
            Default-key usage grouped by model, highest cost first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {by_model.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No default-key usage in this range yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Usage by model">
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {by_model.map((row) => (
                    <TableRow key={row.model_id}>
                      <TableCell className="font-medium">
                        {row.model_id}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.input_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(row.estimated_cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By feature</CardTitle>
          <CardDescription>
            Which actions consume the free key, most calls first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {by_action.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No default-key usage in this range yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Usage by feature">
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {by_action.map((row) => (
                    <TableRow key={row.action_type}>
                      <TableCell className="font-medium">
                        {ACTION_LABELS(row.action_type)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.input_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(row.estimated_cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top users</CardTitle>
          <CardDescription>
            Highest free-key cost first — useful for spotting abuse. Top 25.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {top_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No default-key usage in this range yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Top users by usage">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_users.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {row.full_name || row.email || "Unknown"}
                          </span>
                          {row.full_name && row.email ? (
                            <span className="text-xs text-muted-foreground">
                              {row.email}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.input_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(row.estimated_cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily</CardTitle>
          <CardDescription>
            Per-day default-key usage, most recent first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {by_day.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No default-key usage in this range yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Daily usage">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {by_day.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(`${row.day}T00:00:00`).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.input_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(row.estimated_cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
