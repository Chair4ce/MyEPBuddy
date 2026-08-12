import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SQL_FIXTURE = path.join(
  REPO_ROOT,
  "supabase/tests/default_key_bandwidth.sql",
);
const CONFIG_TOML = path.join(REPO_ROOT, "supabase/config.toml");

const PASS_MARK =
  "PASS default-key bandwidth: empty deny, refill, alone>5, fair-share deny";

function readProjectId(): string | null {
  if (!existsSync(CONFIG_TOML)) return null;
  const match = readFileSync(CONFIG_TOML, "utf8").match(
    /^\s*project_id\s*=\s*"([^"]+)"/m,
  );
  return match?.[1] ?? null;
}

function localDbReachable(): boolean {
  const result = spawnSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "54322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      "SELECT 1",
    ],
    {
      env: { ...process.env, PGPASSWORD: "postgres" },
      encoding: "utf8",
    },
  );
  return result.status === 0 && (result.stdout ?? "").trim() === "1";
}

function myepbuddyDbContainerRunning(): boolean {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  return (result.stdout ?? "")
    .split("\n")
    .some((n) => n.trim() === "supabase_db_myepbuddy");
}

const canRun =
  readProjectId() === "myepbuddy" &&
  myepbuddyDbContainerRunning() &&
  localDbReachable() &&
  existsSync(SQL_FIXTURE);

describe("consume_credit default-key bandwidth (local SQL)", () => {
  it.skipIf(!canRun)(
    "denies empty bucket, refills after idle, allows alone >5, fair-share denies",
    () => {
      const result = spawnSync(
        "psql",
        [
          "-h",
          "127.0.0.1",
          "-p",
          "54322",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          SQL_FIXTURE,
        ],
        {
          env: { ...process.env, PGPASSWORD: "postgres" },
          encoding: "utf8",
        },
      );

      const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      expect(result.status, combined).toBe(0);
      expect(combined).toContain(PASS_MARK);
    },
  );
});
