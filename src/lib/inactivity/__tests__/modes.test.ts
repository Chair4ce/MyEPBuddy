import { describe, expect, it } from "vitest";
import {
  allInactivityModesOff,
  parseInactivityMode,
  readInactivityCap,
  resolveInactivityCaps,
  resolveInactivityModes,
} from "../modes";

describe("inactivity modes", () => {
  it("ships notices in dry-run and the destructive switches off", () => {
    const modes = resolveInactivityModes({});
    expect(modes).toEqual({ notices: "dry_run", suspend: "off", delete: "off" });
    expect(allInactivityModesOff(modes)).toBe(false);
  });

  it("accepts a process.env-shaped object (the cron route passes process.env)", () => {
    // Typed as NodeJS.ProcessEnv on purpose: the route calls these with
    // process.env, and a parameter type without an index signature fails
    // `next build` type checking (TS2559).
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production", CRON_SECRET: "x" };
    expect(resolveInactivityModes(env)).toEqual({
      notices: "dry_run",
      suspend: "off",
      delete: "off",
    });
    expect(resolveInactivityCaps(env)).toEqual({
      noticeDaily: 25,
      suspendPerRun: 25,
      deleteWeekly: 25,
    });
  });

  it("fails closed on unknown values", () => {
    expect(parseInactivityMode("yes", "dry_run")).toBe("off");
    expect(parseInactivityMode("LIVE!", "off")).toBe("off");
  });

  it("accepts dry-run aliases when set explicitly", () => {
    expect(parseInactivityMode("dry-run", "off")).toBe("dry_run");
    expect(parseInactivityMode(" dry_run ", "off")).toBe("dry_run");
  });

  it("lets ?dry_run=1 demote live and never promote off", () => {
    const url = new URL("https://www.myepbuddy.com/api/cron/inactivity-notices?dry_run=1");
    expect(
      resolveInactivityModes(
        {
          INACTIVITY_NOTICES_MODE: "live",
          INACTIVITY_SUSPEND_MODE: "live",
          INACTIVITY_DELETE_MODE: "off",
        },
        url
      )
    ).toEqual({ notices: "dry_run", suspend: "dry_run", delete: "off" });
  });

  it("keeps caps inside 1..100", () => {
    expect(readInactivityCap(undefined, 25)).toBe(25);
    expect(readInactivityCap("10", 25)).toBe(10);
    expect(readInactivityCap("0", 25)).toBe(25);
    expect(readInactivityCap("101", 25)).toBe(25);
    expect(readInactivityCap("nope", 25)).toBe(25);
  });
});
