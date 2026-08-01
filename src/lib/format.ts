/** Explicit locale/timeZone for SSR-safe formatting (react-doctor no-locale-format-in-render). */
const LOCALE = "en-US";
const TIME_ZONE = "UTC";

export function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

export function formatShortDateWithYear(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLongMonthDay(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
  });
}

export function formatMonthYear(date: Date | string, month: "long" | "short" = "long"): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month,
    year: "numeric",
  });
}

export function formatDayOnly(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
  });
}

export function formatDateDefault(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
}

export function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
  } catch {
    return isoString;
  }
}

export function formatDateTimeDetailed(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString(LOCALE, {
      timeZone: TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatTime(date: Date | string): string {
  try {
    return new Date(date).toLocaleTimeString(LOCALE, {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(date);
  }
}

export function formatDateRange(
  start: Date | string,
  end: Date | string,
  options?: { endIncludeYear?: boolean }
): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startStr = startDate.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  });
  const endStr = endDate.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(options?.endIncludeYear ? { year: "numeric" } : {}),
  });
  return `${startStr} - ${endStr}`;
}

export function formatWeekRange(start: Date | string, end: Date | string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startStr = startDate.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  });
  const endStr = endDate.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} - ${endStr}`;
}

function formatMonthSpan(start: Date | string, end: Date | string): string {
  const startMonth = new Date(start).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
  });
  const endMonth = new Date(end).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
  });
  return `${startMonth} – ${endMonth}`;
}

export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatShortDate(dateStr);
}

export function formatCreatedAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function formatShortMonthYear(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
    year: "numeric",
  });
}

export function formatMediumDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatWeekdayShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMonthOnly(date: Date | string): string {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    month: "short",
  });
}

export function formatInteger(value: number): string {
  return value.toLocaleString(LOCALE);
}

export function formatUsd(value: number): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
