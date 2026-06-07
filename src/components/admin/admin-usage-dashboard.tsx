import type { ComponentType } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UsageBarChart } from "@/components/admin/usage-bar-chart";
import type { AdminUsagePageData } from "@/components/admin/admin-usage-types";
import {
  RANGE_OPTIONS,
  actionLabel,
  bucketLabel,
  categoryLabel,
  formatCost,
  formatInt,
  formatPct,
  projectedMonthlyCost,
  segmentLabel,
} from "@/lib/admin/usage-formatters";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Coins,
  KeyRound,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon ? <Icon className="size-4 text-muted-foreground shrink-0" /> : null}
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RangeNav({ days }: { days: number }) {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
      aria-label="Time range"
    >
      {RANGE_OPTIONS.map((option) => {
        const isActive = option.days === days;
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
  );
}

function segmentBadgeVariant(
  segment: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (segment) {
    case "purchased":
      return "default";
    case "byok":
      return "secondary";
    case "exhausted":
      return "destructive";
    default:
      return "outline";
  }
}

export function AdminUsageDashboard({ data }: { data: AdminUsagePageData }) {
  const { credits, defaultKey, days } = data;
  const { conversion, trial_burn, byok_models, population } = credits;
  const monthlyCost = projectedMonthlyCost(
    defaultKey.totals.estimated_cost_usd,
    days,
  );

  const dailyBurnItems = trial_burn.by_day.slice(0, 14).reverse().map((row) => ({
    label: new Date(`${row.day}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    value: row.calls,
    sublabel: `${row.unique_users} users`,
  }));

  const weeklyBurnItems = trial_burn.by_week.slice(0, 8).reverse().map((row) => ({
    label: new Date(`${row.week_start}T00:00:00`).toLocaleDateString(
      undefined,
      { month: "short", day: "numeric" },
    ),
    value: row.calls,
    sublabel: `${row.unique_users} users`,
  }));

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-6" />
            Usage Analytics
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            Trial burn rate, conversion funnel, BYOK model choices, and your
            estimated cost for the free Gemini app key. Use this to tune the
            100-call trial and spot abuse.
          </p>
        </div>
        <RangeNav days={days} />
      </div>

      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        aria-label="Key metrics"
      >
        <SummaryCard
          label="Est. monthly cost (you)"
          value={formatCost(monthlyCost)}
          hint={`${formatCost(defaultKey.totals.estimated_cost_usd)} in last ${days}d · ${formatCost(defaultKey.all_time.estimated_cost_usd)} all-time`}
          icon={Coins}
        />
        <SummaryCard
          label="Free-key AI calls"
          value={formatInt(defaultKey.totals.calls)}
          hint={`${formatInt(population.default_key_active_in_window)} active users in window`}
          icon={TrendingUp}
        />
        <SummaryCard
          label="Avg trial consumed"
          value={`${trial_burn.avg_trial_consumed} / ${credits.trial_credits}`}
          hint={`${formatInt(trial_burn.avg_calls_per_week)} calls/wk avg (free key)`}
          icon={Users}
        />
        <SummaryCard
          label="Conversion (any)"
          value={formatPct(conversion.rates.any_convert_pct)}
          hint={`${formatPct(conversion.rates.purchase_rate_pct)} bought credits · ${formatPct(conversion.rates.byok_rate_pct)} BYOK`}
          icon={ShoppingCart}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trial burn distribution</CardTitle>
            <CardDescription>
              How much of the free {credits.trial_credits} calls each user has
              consumed (trial credits assumed consumed first).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBarChart
              aria-label="Trial consumption distribution"
              items={trial_burn.distribution.map((row) => ({
                label: bucketLabel(row.bucket),
                value: row.users,
                sublabel: "users",
              }))}
              valueFormatter={(v) => formatInt(v)}
            />
            <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Avg calls / week</p>
                <p className="text-lg font-semibold tabular-nums">
                  {trial_burn.avg_calls_per_week}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Avg days to exhaust trial</p>
                <p className="text-lg font-semibold tabular-nums">
                  {trial_burn.avg_days_to_exhaust_trial > 0
                    ? trial_burn.avg_days_to_exhaust_trial
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Free-key call velocity</CardTitle>
            <CardDescription>
              Default-key calls per day (last 14 days) and per week — your burn
              rate for subsidized usage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Daily</p>
              <UsageBarChart
                aria-label="Daily free-key calls"
                items={dailyBurnItems}
                valueFormatter={(v) => formatInt(v)}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Weekly</p>
              <UsageBarChart
                aria-label="Weekly free-key calls"
                items={weeklyBurnItems}
                valueFormatter={(v) => formatInt(v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Conversion funnel
          </CardTitle>
          <CardDescription>
            Among users who have used at least one credit: who bought more,
            brought their own key, or churned after exhausting the trial?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Used any credits</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatInt(conversion.consumed_any)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                of {formatInt(population.total_users)} members
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <ShoppingCart className="size-3.5" />
                Purchased credits
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatInt(conversion.purchased_credits)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatPct(conversion.rates.purchase_rate_pct)} of active
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <KeyRound className="size-3.5" />
                BYOK (own key)
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatInt(conversion.byok_users)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatInt(conversion.byok_only)} BYOK-only ·{" "}
                {formatInt(conversion.credits_first_byok)} credits-first
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Exhausted, no convert</p>
              <p className="text-2xl font-bold tabular-nums text-destructive">
                {formatInt(conversion.exhausted_no_convert)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatPct(conversion.rates.exhausted_no_convert_pct)} of active
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Trial-only active: </span>
              <span className="font-medium tabular-nums">
                {formatInt(conversion.trial_only_active)}
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">BYOK + purchased: </span>
              <span className="font-medium tabular-nums">
                {formatInt(conversion.byok_and_purchased)}
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Never used trial: </span>
              <span className="font-medium tabular-nums">
                {formatInt(conversion.dormant)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            BYOK model usage
          </CardTitle>
          <CardDescription>
            Calls on users&apos; own keys, excluding the free{" "}
            <code className="text-xs">gemini-2.5-flash-lite</code> model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="mb-3 text-sm font-medium">By feature area</p>
            {byok_models.by_category.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No BYOK non-free model usage in this range yet.
              </p>
            ) : (
              <UsageBarChart
                aria-label="BYOK usage by category"
                items={byok_models.by_category.map((row) => ({
                  label: categoryLabel(row.category),
                  value: row.calls,
                  sublabel: `${row.unique_users} users`,
                }))}
                valueFormatter={(v) => formatInt(v)}
              />
            )}
          </div>

          {byok_models.by_model.length > 0 ? (
            <div className="overflow-x-auto">
              <Table aria-label="BYOK model usage">
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byok_models.by_model.map((row) => (
                    <TableRow key={row.model_id}>
                      <TableCell className="font-medium">{row.model_id}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.unique_users)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {byok_models.by_model_and_category.length > 0 ? (
            <div>
              <p className="mb-3 text-sm font-medium">Model × feature</p>
              <div className="overflow-x-auto">
                <Table aria-label="BYOK model and category breakdown">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byok_models.by_model_and_category.slice(0, 20).map((row) => (
                      <TableRow key={`${row.model_id}-${row.category}`}>
                        <TableCell className="font-medium">{row.model_id}</TableCell>
                        <TableCell>{categoryLabel(row.category)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.calls)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trial users</CardTitle>
          <CardDescription>
            Top 50 by trial consumption — burn rate and segment for tuning the
            free tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credits.trial_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No users have consumed trial credits yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Trial user consumption">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead>Trial used</TableHead>
                    <TableHead className="text-right">Calls/wk</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.trial_users.map((row) => {
                    const trialPct = Math.min(
                      100,
                      (row.trial_consumed / credits.trial_credits) * 100,
                    );
                    return (
                      <TableRow key={row.user_id}>
                        <TableCell>
                          <div className="flex flex-col min-w-[140px]">
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
                        <TableCell>
                          <Badge variant={segmentBadgeVariant(row.segment)}>
                            {segmentLabel(row.segment)}
                          </Badge>
                          {row.has_byok ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              + key
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-[160px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs tabular-nums">
                              <span>
                                {row.trial_consumed}/{credits.trial_credits}
                              </span>
                              <span className="text-muted-foreground">
                                {Math.round(trialPct)}%
                              </span>
                            </div>
                            <Progress value={trialPct} aria-label={`${row.trial_consumed} of ${credits.trial_credits} trial credits used`} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.calls_per_week}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.balance)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.lifetime_purchased)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Coins className="size-5" />
            Your free-key cost (Gemini app key)
          </h2>
          <p className="text-sm text-muted-foreground">
            Token-level cost for all default-key usage. Projected monthly:{" "}
            <span className="font-medium text-foreground">
              {formatCost(monthlyCost)}
            </span>
          </p>
        </div>

        <section
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          aria-label="Default key token totals"
        >
          <SummaryCard
            label="AI calls"
            value={formatInt(defaultKey.totals.calls)}
          />
          <SummaryCard
            label="Input tokens"
            value={formatInt(defaultKey.totals.input_tokens)}
            hint={
              defaultKey.totals.cached_input_tokens
                ? `${formatInt(defaultKey.totals.cached_input_tokens)} cached`
                : undefined
            }
          />
          <SummaryCard
            label="Output tokens"
            value={formatInt(defaultKey.totals.output_tokens)}
          />
          <SummaryCard
            label="Est. cost (window)"
            value={formatCost(defaultKey.totals.estimated_cost_usd)}
            hint={`${formatCost(defaultKey.all_time.estimated_cost_usd)} all-time`}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By model (free key)</CardTitle>
              <CardDescription>Token cost on your Gemini app key.</CardDescription>
            </CardHeader>
            <CardContent>
              {defaultKey.by_model.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table aria-label="Default key usage by model">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Est. cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {defaultKey.by_model.map((row) => (
                        <TableRow key={row.model_id}>
                          <TableCell className="font-medium">
                            {row.model_id}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatInt(row.calls)}
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
              <CardTitle>By feature (free key)</CardTitle>
              <CardDescription>Which actions drive your spend.</CardDescription>
            </CardHeader>
            <CardContent>
              {defaultKey.by_action.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                <UsageBarChart
                  aria-label="Default key usage by feature"
                  items={defaultKey.by_action.map((row) => ({
                    label: actionLabel(row.action_type),
                    value: row.calls,
                    sublabel: formatCost(row.estimated_cost_usd),
                  }))}
                  valueFormatter={(v) => formatInt(v)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top users (free key cost)</CardTitle>
            <CardDescription>
              Highest subsidized cost — useful for abuse detection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {defaultKey.top_users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table aria-label="Top users by free key cost">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Est. cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaultKey.top_users.map((row) => (
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
    </div>
  );
}
