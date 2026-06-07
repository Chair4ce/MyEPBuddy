export interface DayCostRow {
  day: string;
  calls: number;
  estimated_cost_usd: number;
}

export interface DailyBurnPoint {
  day: string;
  label: string;
  calls: number;
  cost: number;
}

export interface WeeklyUsersPoint {
  week: string;
  label: string;
  users: number;
  calls: number;
}

export interface ByokModelPoint {
  model: string;
  calls: number;
  users: number;
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Monday-based week start to match Postgres date_trunc('week', ...). */
function weekStartKey(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return toDateKey(date);
}

export function useWeeklyBurnGranularity(totalDays: number): boolean {
  return totalDays > 30;
}

function shortModelName(modelId: string): string {
  return modelId
    .replace("gemini-", "gem-")
    .replace("claude-", "cl-")
    .replace("gpt-", "gpt-")
    .replace(/-20\d{6}$/, "");
}

/** Calendar-filled daily series for the selected window. */
export function buildDailyBurnSeries(
  callsByDay: { day: string; calls: number }[],
  costByDay: DayCostRow[],
  totalDays: number,
): DailyBurnPoint[] {
  const callsMap = new Map(callsByDay.map((row) => [row.day, row.calls]));
  const costMap = new Map(
    costByDay.map((row) => [row.day, Number(row.estimated_cost_usd ?? 0)]),
  );

  const items: DailyBurnPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    items.push({
      day,
      label: formatDayLabel(day),
      calls: callsMap.get(day) ?? 0,
      cost: costMap.get(day) ?? 0,
    });
  }

  return items;
}

/** Weekly burn + cost for longer ranges (keeps the chart viewport-friendly). */
export function buildWeeklyBurnSeries(
  callsByWeek: { week_start: string; calls: number }[],
  costByDay: DayCostRow[],
): DailyBurnPoint[] {
  const costByWeek = new Map<string, number>();
  for (const row of costByDay) {
    const week = weekStartKey(row.day);
    costByWeek.set(
      week,
      (costByWeek.get(week) ?? 0) + Number(row.estimated_cost_usd ?? 0),
    );
  }

  return [...callsByWeek]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((row) => ({
      day: row.week_start,
      label: formatWeekLabel(row.week_start),
      calls: row.calls,
      cost: costByWeek.get(row.week_start) ?? 0,
    }));
}

export function buildWeeklyUsersSeries(
  byWeek: { week_start: string; unique_users: number; calls: number }[],
): WeeklyUsersPoint[] {
  return [...byWeek]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((row) => ({
      week: row.week_start,
      label: formatWeekLabel(row.week_start),
      users: row.unique_users,
      calls: row.calls,
    }));
}

export function buildByokModelSeries(
  byModel: { model_id: string; calls: number; unique_users: number }[],
  limit = 8,
): ByokModelPoint[] {
  return [...byModel]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, limit)
    .map((row) => ({
      model: shortModelName(row.model_id),
      calls: row.calls,
      users: row.unique_users,
    }));
}
