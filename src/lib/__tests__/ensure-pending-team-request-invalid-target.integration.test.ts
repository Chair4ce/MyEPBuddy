import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SQL_FIXTURE = path.join(
  REPO_ROOT,
  "supabase/tests/ensure_pending_team_request_invalid_target.sql"
);
const CONFIG_TOML = path.join(REPO_ROOT, "supabase/config.toml");
const DB_CONTAINER = "supabase_db_myepbuddy";

const PASS_MARK =
  "PASS ensure-pending-invalid-target: returns JSON invalid_target";

function readProjectId(): string | null {
  if (!existsSync(CONFIG_TOML)) return null;
  const match = readFileSync(CONFIG_TOML, "utf8").match(
    /^\s*project_id\s*=\s*"([^"]+)"/m
  );
  return match?.[1] ?? null;
}

function myepbuddyDbContainerRunning(): boolean {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  return (result.stdout ?? "")
    .split("\n")
    .some((n) => n.trim() === DB_CONTAINER);
}

function runSql(sql: string) {
  const host = spawnSync(
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
    ],
    {
      env: { ...process.env, PGPASSWORD: "postgres" },
      encoding: "utf8",
      input: sql,
    }
  );
  if (host.error == null) {
    return host;
  }

  return spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      encoding: "utf8",
      input: sql,
    }
  );
}

const canRun =
  readProjectId() === "myepbuddy" &&
  myepbuddyDbContainerRunning() &&
  existsSync(SQL_FIXTURE);

describe("ensure_pending_team_request self-target (local SQL)", () => {
  it.skipIf(!canRun)("returns invalid_target JSON instead of raising 22023", () => {
    const result = runSql(readFileSync(SQL_FIXTURE, "utf8"));
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.status, combined).toBe(0);
    expect(combined).toContain(PASS_MARK);
  });
});
