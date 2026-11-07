import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SQL_FIXTURE = path.join(REPO_ROOT, "supabase/tests/purchase_thank_you.sql");
const CONFIG_TOML = path.join(REPO_ROOT, "supabase/config.toml");
const DB_CONTAINER = "supabase_db_myepbuddy";
const PASS_MARK = "PASS purchase-thank-you claims";

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
  if (host.error == null && host.status === 0) return host;
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
    { encoding: "utf8", input: sql }
  );
}

const canRun =
  readProjectId() === "myepbuddy" &&
  myepbuddyDbContainerRunning() &&
  existsSync(SQL_FIXTURE);

const RACE_USER = "c6666666-6666-4666-8666-666666666666";

function startSql(sql: string): ChildProcess {
  const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });
  const child =
    probe.error == null && probe.status === 0
      ? spawn(
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
          { env: { ...process.env, PGPASSWORD: "postgres" } }
        )
      : spawn(
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
          { env: process.env }
        );
  if (!child.stdin) throw new Error("psql stdin is not available");
  child.stdin.write(sql);
  child.stdin.end();
  return child;
}

function collect(child: ChildProcess): Promise<{ code: number | null; out: string }> {
  let out = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function waitForReady(sql: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    const result = runSql(sql);
    last = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if ((result.stdout ?? "").includes("READY")) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out\n${last}`);
}

describe("purchase thank-you claims (local SQL)", () => {
  it("declares privilege checks and a separate two-connection case", () => {
    const fixture = readFileSync(SQL_FIXTURE, "utf8");
    expect(fixture).toContain("anon, authenticated, or public can execute");
    expect(fixture).toContain("service_role cannot execute a thank-you function");
    expect(fixture).toContain("authenticated jwt called purchase_thank_you_expire");
    expect(fixture).toContain("Same session, same transaction");
  });

  it.skipIf(!canRun)("claims only the first paid 100 after the cutoff", () => {
    const result = runSql(readFileSync(SQL_FIXTURE, "utf8"));
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.status, combined).toBe(0);
    expect(combined).toContain(PASS_MARK);
  });

  it.skipIf(!canRun)(
    "two connections serialize one first-send claim",
    async () => {
      const previous = runSql(`
        COPY (
          SELECT COALESCE(activated_at::text, '<null>')
          FROM public.purchase_thank_you_settings
          WHERE id = 1
        ) TO STDOUT;
      `);
      expect(previous.status, `${previous.stdout}\n${previous.stderr}`).toBe(0);
      const previousCutoff = (previous.stdout ?? "").trim();
      let holder: ChildProcess | null = null;
      let contender: ChildProcess | null = null;
      try {
        const seeded = runSql(`
          DELETE FROM auth.users WHERE id = '${RACE_USER}';
          INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token
          ) VALUES (
            '${RACE_USER}',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'race.thankyou@example.com',
            crypt('password123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Race Thank You"}'::jsonb,
            now(), now(), '', ''
          );
          UPDATE public.profiles
          SET email = 'race.thankyou@example.com'
          WHERE id = '${RACE_USER}';
          SELECT grant_credits(
            '${RACE_USER}'::uuid, 100, 'purchase', 'evt_race', 'race 100', 'cs_race'
          );
        `);
        expect(seeded.status, `${seeded.stdout}\n${seeded.stderr}`).toBe(0);
        const activated = runSql(`
          COPY (
            SELECT public.purchase_thank_you_activate(
              GREATEST(
                COALESCE(
                  (SELECT activated_at FROM public.purchase_thank_you_settings WHERE id = 1),
                  now()
                ),
                now()
              )
            )::text
          ) TO STDOUT;
        `);
        const activatedOut = `${activated.stdout ?? ""}\n${activated.stderr ?? ""}`;
        expect(activated.status, activatedOut).toBe(0);
        const cutoff = (activated.stdout ?? "").trim();
        expect(cutoff).toMatch(/^\d{4}-/);

        holder = startSql(`
          \\set ON_ERROR_STOP on
          SET application_name = 'thank_you_race_holder';
          BEGIN;
          SELECT public.purchase_thank_you_prepare_send(
            '${RACE_USER}'::uuid,
            'cs_race',
            'evt_race_holder',
            timestamptz '${cutoff}',
            timestamptz '${cutoff}'
          );
          SELECT pg_sleep(6);
          COMMIT;
        `);
        const holderDone = collect(holder);
        await waitForReady(
          `
            SELECT CASE WHEN EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE application_name = 'thank_you_race_holder'
                AND state = 'active'
                AND query ILIKE '%pg_sleep%'
            ) THEN 'READY' ELSE 'WAIT' END;
          `,
          8000
        );

        contender = startSql(`
          \\set ON_ERROR_STOP on
          SET application_name = 'thank_you_race_contender';
          SET statement_timeout = '12s';
          SELECT public.purchase_thank_you_prepare_send(
            '${RACE_USER}'::uuid,
            'cs_race',
            'evt_race_contender',
            timestamptz '${cutoff}',
            timestamptz '${cutoff}'
          );
        `);
        const contenderDone = collect(contender);
        await waitForReady(
          `
            SELECT CASE WHEN EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE application_name = 'thank_you_race_contender'
                AND wait_event_type = 'Lock'
                AND wait_event = 'advisory'
            ) THEN 'READY' ELSE 'WAIT' END;
          `,
          8000
        );

        const [held, raced] = await Promise.all([holderDone, contenderDone]);
        holder = null;
        contender = null;
        const combined = `${held.out}\n${raced.out}`;
        expect(held.code, combined).toBe(0);
        expect(raced.code, combined).toBe(0);
        expect(held.out).toContain('"action":"send"');
        expect(raced.out).toContain('"reason":"in_flight"');

        const claims = runSql(`
          COPY (
            SELECT status || ':' || count(*)::text
            FROM public.purchase_thank_you_claims
            WHERE user_id = '${RACE_USER}'
            GROUP BY status
          ) TO STDOUT;
        `);
        const claimOut = `${claims.stdout ?? ""}\n${claims.stderr ?? ""}`;
        expect(claims.status, claimOut).toBe(0);
        expect(claimOut).toContain("sending:1");
      } finally {
        holder?.kill("SIGTERM");
        contender?.kill("SIGTERM");
        const restored =
          previousCutoff === "<null>" ? "NULL" : `timestamptz '${previousCutoff}'`;
        runSql(`
          DELETE FROM auth.users WHERE id = '${RACE_USER}';
          UPDATE public.purchase_thank_you_settings
          SET activated_at = ${restored}
          WHERE id = 1;
        `);
      }
    },
    20_000
  );
});
