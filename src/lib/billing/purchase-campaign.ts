import { PURCHASE_CREDITS } from "@/lib/billing/constants";

export const PURCHASE_CAMPAIGN_METADATA_KEY = "campaign_slug";
export const PURCHASE_CAMPAIGN_TZ_METADATA_KEY = "campaign_tz";
export const VIEWER_TIMEZONE_HEADER = "x-viewer-timezone";

export type PurchaseCampaignOffer = {
  slug: string;
  title: string;
  subtitle: string;
  bonusCredits: number;
  startsAt: string;
  endsAt: string;
  claimed: boolean;
};

type CivilDate = {
  year: number;
  month: number;
  day: number;
};

const IANA_TZ_RE = /^[A-Za-z0-9_+\-/]+$/;

/**
 * Accept a browser/IANA timezone for campaign windows. Invalid or missing
 * values fail closed — callers must not treat them as UTC or America/New_York.
 */
export function parseViewerTimeZone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const timeZone = raw.trim();
  if (timeZone.length < 1 || timeZone.length > 64) return null;
  if (!IANA_TZ_RE.test(timeZone)) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return null;
  }
}

export function getViewerTimeZone(): string | null {
  try {
    return parseViewerTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    return null;
  }
}

export function viewerTimeZoneHeaders(): HeadersInit {
  const timeZone = getViewerTimeZone();
  return timeZone ? { [VIEWER_TIMEZONE_HEADER]: timeZone } : {};
}

function civilDateFromUtcInstant(instant: Date): CivilDate {
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

function zonedDateTimeParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function compareZonedToCivilMidnight(
  now: Date,
  timeZone: string,
  civil: CivilDate,
): number {
  const local = zonedDateTimeParts(now, timeZone);
  const left = [
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
    local.second,
  ];
  const right = [civil.year, civil.month, civil.day, 0, 0, 0];
  for (let i = 0; i < left.length; i += 1) {
    if (!Number.isFinite(left[i])) return -1;
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Timed campaigns use civil calendar dates, not a single absolute instant.
 * `starts_at` / `ends_at` timestamptz values are date anchors: the UTC
 * Y-M-D is the local start (inclusive) and local exclusive end.
 *
 * Example: Friday 2026-09-18 00:00 through exclusive 2026-09-22 00:00 in
 * each viewer's IANA timezone. The same UTC instant can be open in
 * America/New_York and still Thursday (closed) in America/Phoenix.
 */
export function isCampaignWindowOpen(
  now: Date,
  startsAt: Date,
  endsAt: Date,
  timeZone: string | null | undefined,
): boolean {
  const tz = parseViewerTimeZone(timeZone);
  if (!tz) return false;
  const start = civilDateFromUtcInstant(startsAt);
  const end = civilDateFromUtcInstant(endsAt);
  return (
    compareZonedToCivilMidnight(now, tz, start) >= 0 &&
    compareZonedToCivilMidnight(now, tz, end) < 0
  );
}

export function shouldStampCampaignOnCheckout(params: {
  claimed: boolean;
  windowOpen: boolean;
}): boolean {
  return params.windowOpen && !params.claimed;
}

export function shouldGrantCampaignBonus(params: {
  claimed: boolean;
  windowOpen: boolean;
  stampedSlug: string | null | undefined;
  campaignSlug: string;
}): boolean {
  if (params.claimed) return false;
  if (params.stampedSlug === params.campaignSlug) return true;
  return params.windowOpen;
}

export function featuredSaleTokens(bonusCredits: number): number {
  return PURCHASE_CREDITS + bonusCredits;
}

export function formatCampaignEndsAt(
  endsAtIso: string,
  timeZone: string | null | undefined,
): string {
  const tz = parseViewerTimeZone(timeZone) ?? "UTC";
  const exclusive = civilDateFromUtcInstant(new Date(endsAtIso));
  const lastIncludedNoonUtc = new Date(
    Date.UTC(exclusive.year, exclusive.month - 1, exclusive.day - 1, 12, 0, 0),
  );
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
    timeZoneName: "short",
  }).format(lastIncludedNoonUtc);
}
