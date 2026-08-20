"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DailyBurnCostChart,
  ByokModelsChart,
  WeeklyActiveUsersChart,
  ActionCostChart,
} from "@/components/admin/usage-charts";
import { WritingAssistCostGrid } from "@/components/admin/writing-assist-cost-grid";
import type { AdminUsagePageData } from "@/components/admin/admin-usage-types";
import {
  buildActionCostSeries,
  buildByokModelSeries,
  buildDailyBurnSeries,
  buildWeeklyBurnSeries,
  buildWeeklyUsersSeries,
  prefersWeeklyBurnGranularity,
} from "@/lib/admin/usage-chart-data";
import {
  RANGE_OPTIONS,
  formatCost,
  formatInt,
  projectedMonthlyCost,
} from "@/lib/admin/usage-formatters";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

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

export function AdminUsageDashboard({ data }: { data: AdminUsagePageData }) {
  const { credits, defaultKey, days } = data;
  const monthlyCost = projectedMonthlyCost(
    defaultKey.totals.estimated_cost_usd,
    days,
  );

  const weeklyBurn = prefersWeeklyBurnGranularity(days);
  const burnSeries = weeklyBurn
    ? buildWeeklyBurnSeries(credits.trial_burn.by_week, defaultKey.by_day)
    : buildDailyBurnSeries(
        credits.trial_burn.by_day,
        defaultKey.by_day,
        days,
      );
  const weeklySeries = buildWeeklyUsersSeries(credits.trial_burn.by_week);
  const byokSeries = buildByokModelSeries(credits.byok_models.by_model);
  const actionSeries = buildActionCostSeries(defaultKey.by_action ?? []);
  const writingAssistCost = actionSeries
    .filter((row) => row.featured)
    .reduce((sum, row) => sum + row.cost, 0);

  const totalByokCalls = credits.byok_models.by_model.reduce(
    (sum, row) => sum + row.calls,
    0,
  );

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-6" />
            Usage Analytics
          </h1>
          <p className="text-muted-foreground">
            Free-tier burn, weekly active users, and own-key model choices.
          </p>
        </div>
        <RangeNav days={days} />
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>
                {weeklyBurn ? "Weekly burn & cost" : "Daily burn & cost"}
              </CardTitle>
              <CardDescription>
                {weeklyBurn
                  ? "Free app-key calls per week (bars) and your estimated spend (line)."
                  : "Free app-key calls per day (bars) and your estimated spend (line)."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-4 text-sm tabular-nums sm:justify-end">
              <div>
                <p className="text-muted-foreground">Period</p>
                <p className="font-semibold">
                  {formatInt(defaultKey.totals.calls)} calls
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost</p>
                <p className="font-semibold">
                  {formatCost(defaultKey.totals.estimated_cost_usd)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">~Monthly</p>
                <p className="font-semibold">{formatCost(monthlyCost)}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <DailyBurnCostChart data={burnSeries} weekly={weeklyBurn} />
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Writing assists</CardTitle>
              <CardDescription>
                Highlighted synonym suggestions plus Expand, Compress, and Rephrase.
                Estimated app-key spend — suggestions are free to members.
              </CardDescription>
            </div>
            <div className="text-sm tabular-nums sm:text-right">
              <p className="text-muted-foreground">Assist cost</p>
              <p className="text-lg font-semibold">{formatCost(writingAssistCost)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          <WritingAssistCostGrid points={actionSeries} />
          <div>
            <p className="mb-2 text-sm font-medium">Estimated cost by feature</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Writing assists in green; other app-key features in blue.
            </p>
            <ActionCostChart data={actionSeries} />
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <CardTitle>Active users per week</CardTitle>
                <CardDescription>
                  Unique members using the free app key each week.
                </CardDescription>
              </div>
              <p className="text-2xl font-bold tabular-nums shrink-0">
                {formatInt(credits.population.default_key_active_in_window)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              total in last {days} days
            </p>
          </CardHeader>
          <CardContent className="min-w-0">
            <WeeklyActiveUsersChart data={weeklySeries} />
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <CardTitle>Own API keys</CardTitle>
                <CardDescription>
                  Models members pick when using their own key.
                </CardDescription>
              </div>
              <p className="text-2xl font-bold tabular-nums shrink-0">
                {formatInt(credits.conversion.byok_users)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              users with keys · {formatInt(totalByokCalls)} calls in period
              {credits.conversion.purchased_credits > 0
                ? ` · ${formatInt(credits.conversion.purchased_credits)} bought tokens`
                : ""}
            </p>
          </CardHeader>
          <CardContent className="min-w-0">
            <ByokModelsChart data={byokSeries} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
