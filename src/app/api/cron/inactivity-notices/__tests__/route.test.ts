import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../route";

const ORIGINAL = {
  CRON_SECRET: process.env.CRON_SECRET,
  INACTIVITY_NOTICES_MODE: process.env.INACTIVITY_NOTICES_MODE,
  INACTIVITY_SUSPEND_MODE: process.env.INACTIVITY_SUSPEND_MODE,
  INACTIVITY_DELETE_MODE: process.env.INACTIVITY_DELETE_MODE,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("inactivity cron route", () => {
  it("rejects a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const response = await GET(new Request("http://localhost:3100/api/cron/inactivity-notices"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("does no work when every switch is off", async () => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.INACTIVITY_NOTICES_MODE = "off";
    process.env.INACTIVITY_SUSPEND_MODE = "off";
    process.env.INACTIVITY_DELETE_MODE = "off";
    const response = await GET(
      new Request("http://localhost:3100/api/cron/inactivity-notices?dry_run=1", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skipped).toBe(true);
    expect(body.notices.mode).toBe("off");
    expect(JSON.stringify(body)).not.toContain("@");
  });
});
