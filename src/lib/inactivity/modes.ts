export type InactivityMode = "off" | "dry_run" | "live";

export type InactivityModes = {
  notices: InactivityMode;
  suspend: InactivityMode;
  delete: InactivityMode;
};

const MODES: readonly InactivityMode[] = ["off", "dry_run", "live"];

/**
 * Unknown values fail closed to `off`. An empty notices switch defaults to
 * dry_run so a deploy without the env var cannot send mail. Suspend and
 * delete default to off.
 */
export function parseInactivityMode(
  value: string | undefined,
  fallback: InactivityMode
): InactivityMode {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase().replace("-", "_");
  if (normalized === "dryrun") return "dry_run";
  if ((MODES as readonly string[]).includes(normalized)) {
    return normalized as InactivityMode;
  }
  return "off";
}

export function resolveInactivityModes(
  env: {
    INACTIVITY_NOTICES_MODE?: string;
    INACTIVITY_SUSPEND_MODE?: string;
    INACTIVITY_DELETE_MODE?: string;
    // Accept process.env (an index-signature type) without a cast.
    [key: string]: string | undefined;
  },
  requestUrl?: URL
): InactivityModes {
  const forceDryRun = requestUrl?.searchParams.get("dry_run") === "1";
  const downgrade = (mode: InactivityMode): InactivityMode =>
    forceDryRun && mode === "live" ? "dry_run" : mode;

  return {
    notices: downgrade(parseInactivityMode(env.INACTIVITY_NOTICES_MODE, "dry_run")),
    suspend: downgrade(parseInactivityMode(env.INACTIVITY_SUSPEND_MODE, "off")),
    delete: downgrade(parseInactivityMode(env.INACTIVITY_DELETE_MODE, "off")),
  };
}

export function anyInactivityModeLive(modes: InactivityModes): boolean {
  return modes.notices === "live" || modes.suspend === "live" || modes.delete === "live";
}

export function allInactivityModesOff(modes: InactivityModes): boolean {
  return modes.notices === "off" && modes.suspend === "off" && modes.delete === "off";
}

/** Caps are positive integers. Anything else falls back. Hard ceiling is 100. */
export function readInactivityCap(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return fallback;
  return parsed;
}

export type InactivityCaps = {
  noticeDaily: number;
  suspendPerRun: number;
  deleteWeekly: number;
};

export function resolveInactivityCaps(env: {
  INACTIVITY_NOTICE_DAILY_CAP?: string;
  INACTIVITY_SUSPEND_RUN_CAP?: string;
  INACTIVITY_DELETE_WEEKLY_CAP?: string;
  [key: string]: string | undefined;
}): InactivityCaps {
  return {
    noticeDaily: readInactivityCap(env.INACTIVITY_NOTICE_DAILY_CAP, 25),
    suspendPerRun: readInactivityCap(env.INACTIVITY_SUSPEND_RUN_CAP, 25),
    deleteWeekly: readInactivityCap(env.INACTIVITY_DELETE_WEEKLY_CAP, 25),
  };
}
