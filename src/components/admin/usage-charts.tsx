"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ByokModelPoint,
  DailyBurnPoint,
  WeeklyUsersPoint,
} from "@/lib/admin/usage-chart-data";
import { formatCost, formatInt } from "@/lib/admin/usage-formatters";

const CHART_1 = "var(--chart-1)";
const CHART_2 = "var(--chart-2)";
const CHART_3 = "var(--chart-3)";
const MUTED = "var(--muted-foreground)";

function formatCostAxis(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
}

function BurnTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const calls = payload.find((p) => p.name === "Calls")?.value ?? 0;
  const cost = payload.find((p) => p.name === "Cost")?.value ?? 0;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatInt(Number(calls))} calls · {formatCost(Number(cost))}
      </p>
    </div>
  );
}

function SimpleTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  valueLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatInt(Number(value))} {valueLabel}
      </p>
    </div>
  );
}

export function DailyBurnCostChart({
  data,
  weekly = false,
}: {
  data: DailyBurnPoint[];
  weekly?: boolean;
}) {
  const hasActivity = data.some((row) => row.calls > 0 || row.cost > 0);
  const tickInterval =
    data.length <= 14 ? 0 : Math.max(0, Math.floor(data.length / 10) - 1);

  if (!hasActivity) {
    return (
      <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No free-tier usage in this period yet.
      </p>
    );
  }

  return (
    <div className="h-[280px] w-full min-w-0 max-w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis
              yAxisId="calls"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={formatCostAxis}
            />
            <Tooltip content={<BurnTooltip />} />
            <Bar
              yAxisId="calls"
              dataKey="calls"
              name="Calls"
              fill={CHART_1}
              radius={[4, 4, 0, 0]}
              maxBarSize={weekly ? 48 : 32}
            />
            <Line
              yAxisId="cost"
              type="monotone"
              dataKey="cost"
              name="Cost"
              stroke={CHART_2}
              strokeWidth={2}
              dot={{ r: weekly ? 3 : 2, fill: CHART_2 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyActiveUsersChart({ data }: { data: WeeklyUsersPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No weekly activity yet.
      </p>
    );
  }

  return (
    <div className="h-[240px] w-full min-w-0 max-w-full">
      <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <Tooltip content={<SimpleTooltip valueLabel="users" />} />
        <Bar
          dataKey="users"
          name="Users"
          fill={CHART_3}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ByokModelsChart({ data }: { data: ByokModelPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No own-key model usage yet.
      </p>
    );
  }

  const chartHeight = Math.max(160, data.length * 36);

  return (
    <div
      className="w-full min-w-0 max-w-full"
      style={{ height: chartHeight }}
    >
      <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="model"
          tick={{ fill: MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={88}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as ByokModelPoint | undefined;
            return (
              <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{label}</p>
                <p className="tabular-nums text-muted-foreground">
                  {formatInt(row?.calls ?? 0)} calls · {formatInt(row?.users ?? 0)}{" "}
                  users
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="calls"
          name="Calls"
          fill={CHART_2}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
      </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
