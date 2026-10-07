/**
 * Inactivity timeline. Keep these day counts in sync with
 * supabase/migrations/223_account_inactivity.sql.
 *
 * Day counts are exact 24-hour periods, matching Postgres `interval 'N days'`.
 */

export const INACTIVITY_NOTICE_60_DAYS = 305;
export const INACTIVITY_NOTICE_30_DAYS = 335;
export const INACTIVITY_SUSPEND_DAYS = 365;
export const INACTIVITY_DELETE_DAYS = 395;
export const INACTIVITY_GAP_AFTER_NOTICE_60_DAYS = 30;
export const INACTIVITY_SUSPEND_AFTER_NOTICE_60_DAYS = 60;
export const INACTIVITY_SUSPEND_AFTER_NOTICE_30_DAYS = 30;
export const INACTIVITY_DELETE_AFTER_SUSPEND_DAYS = 30;

export const INACTIVITY_TIME_ZONE = "America/Phoenix";
export const INACTIVITY_LOGIN_ORIGIN = "https://www.myepbuddy.com";

const DAY_MS = 24 * 60 * 60 * 1000;

export type InactivityNoticeKind = "notice_60" | "notice_30" | "suspended";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function maxDate(first: Date, ...rest: Date[]): Date {
  return rest.reduce(
    (latest, candidate) => (candidate.getTime() > latest.getTime() ? candidate : latest),
    first
  );
}

/**
 * Earliest moment a suspension email may name, given when the warnings
 * actually went out. A late notice pushes this later. It never moves earlier
 * than day 365.
 */
export function earliestSuspendAt(input: {
  now: Date;
  activityAt: Date;
  stage: InactivityNoticeKind;
  notice60SentAt?: Date | null;
  notice30SentAt?: Date | null;
}): Date {
  const day365 = addDays(input.activityAt, INACTIVITY_SUSPEND_DAYS);

  if (input.stage === "notice_60") {
    return maxDate(day365, addDays(input.now, INACTIVITY_SUSPEND_AFTER_NOTICE_60_DAYS));
  }

  if (input.stage === "notice_30") {
    if (!input.notice60SentAt) {
      throw new Error("30-day notice requires a sent 60-day notice");
    }
    return maxDate(
      day365,
      addDays(input.notice60SentAt, INACTIVITY_SUSPEND_AFTER_NOTICE_60_DAYS),
      addDays(input.now, INACTIVITY_SUSPEND_AFTER_NOTICE_30_DAYS)
    );
  }

  if (!input.notice60SentAt || !input.notice30SentAt) {
    throw new Error("Suspension requires both notices");
  }

  return maxDate(
    day365,
    addDays(input.notice60SentAt, INACTIVITY_SUSPEND_AFTER_NOTICE_60_DAYS),
    addDays(input.notice30SentAt, INACTIVITY_SUSPEND_AFTER_NOTICE_30_DAYS)
  );
}

/** Earliest moment the 30-day notice may send. */
export function earliestNotice30At(activityAt: Date, notice60SentAt: Date): Date {
  return maxDate(
    addDays(activityAt, INACTIVITY_NOTICE_30_DAYS),
    addDays(notice60SentAt, INACTIVITY_GAP_AFTER_NOTICE_60_DAYS)
  );
}

/** Earliest moment the account may be deleted. */
export function earliestDeleteAt(activityAt: Date, suspendedAt: Date): Date {
  return maxDate(
    addDays(activityAt, INACTIVITY_DELETE_DAYS),
    addDays(suspendedAt, INACTIVITY_DELETE_AFTER_SUSPEND_DAYS)
  );
}

/**
 * True when the database timestamp is not earlier than the rule.
 * A later date is allowed (the warning only got longer).
 */
export function suspendDateHonorsRule(statedIso: string, earliest: Date): boolean {
  const stated = new Date(statedIso).getTime();
  if (Number.isNaN(stated)) return false;
  return stated + 2000 >= earliest.getTime();
}

export function inactivityIdempotencyKey(
  userId: string,
  noticeType: string,
  activityAt: string
): string {
  const epoch = Math.floor(new Date(activityAt).getTime() / 1000);
  return `inactivity/${userId}/${noticeType}/${epoch}`;
}

export function formatInactivityDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: INACTIVITY_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatInactivityMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: INACTIVITY_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Start of the America/Phoenix calendar day containing `now` (UTC-7, no DST). */
export function phoenixDayStart(now: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: INACTIVITY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T07:00:00.000Z`);
}

const PHOENIX_WEEKDAY: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Monday 00:00 America/Phoenix of the week containing `now`. */
export function phoenixWeekStart(now: Date): Date {
  const start = phoenixDayStart(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: INACTIVITY_TIME_ZONE,
    weekday: "short",
  }).format(now);
  const delta = PHOENIX_WEEKDAY[weekday];
  if (delta == null) {
    throw new Error("Could not resolve America/Phoenix weekday");
  }
  return new Date(start.getTime() - delta * DAY_MS);
}
