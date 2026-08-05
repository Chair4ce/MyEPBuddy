# AGENTS.md

## Cursor Cloud specific instructions

MyEPBuddy is a single Next.js 15 app (App Router + Turbopack) backed by a **local Supabase stack** (Postgres, Auth, Realtime, Storage, Studio, Mailpit) that runs in Docker. Standard commands live in `package.json` and the `README.md`; only the non-obvious cloud caveats are captured here.

### Starting the app (what the update script does NOT do)
The update script only refreshes npm deps. On a fresh VM you must start services yourself:

1. Start the Docker daemon (there is no systemd here):
   `sudo dockerd > /tmp/dockerd.log 2>&1 &` — wait a few seconds, then `docker info` should work.
   If `docker` needs sudo, run `sudo chmod 666 /var/run/docker.sock` once.
2. `npm run dev` — this auto-runs `supabase start` (if the DB container isn't up) and then `next dev --turbopack` on http://localhost:3000. First `supabase start` pulls images and can take a few minutes.

Supabase ports: API `54321`, Postgres `54322`, Studio `54323`, Mailpit (email testing UI) `54324`.

### Supabase CLI version is pinned to v2.90.1 — do NOT upgrade
`supabase/config.toml` uses the legacy config format. This is version-sensitive:
- CLI **v2.111+** fails to parse the config (`ProjectConfigParseError`).
- CLI **v2.48.3** parses it but ships a storage-api image that crash-loops with `relation "migrations" does not exist`.
- CLI **v2.90.1** works (config parses, storage healthy). Keep this version. Do **not** run `supabase update` / accept the CLI upgrade prompt.

If a `supabase start` ever leaves a wedged `supabase_storage_myepbuddy` container (stuck "Restarting"), clear it before retrying:
`supabase stop --no-backup; docker rm -f supabase_storage_myepbuddy; docker volume rm supabase_storage_myepbuddy`.

### Environment variables (`.env.local`)
`.env.local` is gitignored and is pre-populated for local dev with the local Supabase demo `anon`/`service_role` JWTs, `http://127.0.0.1:54321` as the Supabase URL, and a locally generated `ENCRYPTION_KEY`. Regenerate keys via `supabase status -o env` if the local stack is recreated.

LLM keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY`) and Stripe keys are intentionally empty. The app boots and all non-AI flows work, but **AI generation/assessment/synonym and billing/credit purchase are non-functional until real keys are added** (add them as Cursor secrets, not in the repo).

### Seeding test data (optional)
`tsx` is NOT a declared dependency, so `npm run db:seed:test-users` fails with "tsx: not found". Use npx and pass env explicitly:
`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<service_role from `supabase status -o env`> npx -y tsx scripts/seed-test-users.ts`
Seeded/test accounts use password `password123` (e.g. `msgt.smith@test.af.mil`, and a fresh onboarding user `new.user@test.af.mil`). New UI signups require email confirmation — grab the confirmation link from Mailpit (http://localhost:54324).

### Lint / test / build
- `npm run lint` — passes with warnings, 0 errors.
- `npm run test` (Vitest) — one pre-existing failure in `src/lib/__tests__/assessment-coaching.test.ts` (a hardcoded expected-string mismatch, unrelated to environment setup); the other 408 tests pass.
- Prefer `npm run dev` over `npm run build` for iteration (dev-focused environment).
