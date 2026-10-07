import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SQL_FIXTURE = path.join(REPO_ROOT, "supabase/tests/account_inactivity.sql");
const CONFIG_TOML = path.join(REPO_ROOT, "supabase/config.toml");
const DB_CONTAINER = "supabase_db_myepbuddy";

const PASS_MARK = "PASS account-inactivity selection";

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
    .some((name) => name.trim() === DB_CONTAINER);
}

/**
 * The fixture inserts auth.sessions, which the postgres login role cannot
 * write on this image. supabase_admin owns auth and is the migration role.
 */
function runSql(sql: string) {
  const host = spawnSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "54322",
      "-U",
      "supabase_admin",
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
  if (host.error == null && host.status === 0) {
    return host;
  }

  return spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      "-u",
      "postgres",
      DB_CONTAINER,
      "psql",
      "-U",
      "supabase_admin",
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

describe("account inactivity selection (local SQL)", () => {
  it.skipIf(!canRun)("honors the timeline, exemptions, and grants", () => {
    const result = runSql(readFileSync(SQL_FIXTURE, "utf8"));
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.status, combined).toBe(0);
    expect(combined).toContain(PASS_MARK);
  });
});
