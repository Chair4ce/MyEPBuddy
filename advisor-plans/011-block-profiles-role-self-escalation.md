# Plan 011: Block self-service `profiles.role` escalation

> **Executor instructions**: Follow step by step. Run every verification command. On STOP conditions, stop and report — do not improvise. Update status in `advisor-plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 71a367e..HEAD -- supabase/migrations src/lib/auth`
> If in-scope files drifted, re-read Current state excerpts before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

`profiles` UPDATE RLS only checks `auth.uid() = id` with no column restriction. Any authenticated user can set `role` to `admin` via the Supabase JS client, then pass `requireAdminUser` checks and mutate platform config (e.g. signup trial credits). This is privilege escalation.

## Current state

- `supabase/migrations/002_rls_policies.sql:25-28` and `061_fix_rls_auth_initplan.sql:10-14`:

```sql
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
```

- Admin gate trusts `profiles.role`: `src/lib/auth/require-admin.ts` (selects profile role).
- No trigger currently freezes `role` on UPDATE.
- Next migration number after existing files: **199** (latest: `198_accomplishment_stewardship_impact.sql`).
- Local Supabase push convention: verify `project_id` in `supabase/config.toml` is `myepbuddy`, `supabase status` OK, containers `supabase_db_myepbuddy` running, then `supabase db push --local` before remote.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm test -- src/lib` | pass |
| Local migrate | `supabase db push --local` | exit 0 (after instance checks) |

## Scope

**In scope**:
- New migration `supabase/migrations/199_protect_profiles_role.sql` (or next free number if 199 taken)
- Optional unit/integration test under `src/lib/__tests__/` or SQL comment smoke steps in the plan verification
- `advisor-plans/README.md` status only

**Out of scope**:
- Changing how admins are promoted in the dashboard (use service_role / SECURITY DEFINER RPC only)
- Broad profiles SELECT hardening (Plan 016)
- Client UI for role editing

## Git workflow

- Branch: `advisor/011-protect-profiles-role`
- Commit style: short imperative why (see `git log -5 --oneline`)
- Do NOT push/PR unless asked

## Steps

### Step 1: Add migration that freezes authz columns on user UPDATE

Create `supabase/migrations/199_protect_profiles_role.sql` that:

1. Creates a `BEFORE UPDATE` trigger function on `profiles` that:
   - If `NEW.role IS DISTINCT FROM OLD.role` (and optionally `is_admin` / other privilege columns if present), raises an exception unless `auth.role() = 'service_role'` (or equivalent JWT claim check used elsewhere in this repo).
2. Attaches the trigger to `profiles`.
3. Does **not** break normal profile edits (name, rank, AFSC, unit, etc.).

Match trigger style used in other migrations in this repo (search `CREATE OR REPLACE FUNCTION` + `TRIGGER` under `supabase/migrations/`).

**Verify**: `rg -n "protect_profiles_role|profiles_role" supabase/migrations/199*.sql` → hits; file names next after 198.

### Step 2: Push local

Run instance checks from `.cursor/rules/supabase-local-instance.mdc`, then:

`supabase db push --local` → exit 0

**Verify**: In local SQL (or `supabase db execute`), authenticated UPDATE of `role` fails; UPDATE of `full_name` succeeds for own row. Service role can still set role if product needs it.

### Step 3: Document admin promotion path

If no SECURITY DEFINER admin-promote RPC exists, add a short comment in the migration header: admins are promoted only via service_role / existing admin tooling. Do not invent a new admin UI.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0

## Test plan

- Manual: as non-admin JWT, `supabase.from('profiles').update({ role: 'admin' }).eq('id', me)` → error.
- Manual: update `full_name` → success.
- Optional: add a vitest that documents expected error message if you have a test harness for RPC; otherwise leave as migration-only with STOP if no local DB.

## Done criteria

- [ ] Migration applied locally
- [ ] Authenticated users cannot change `profiles.role`
- [ ] Legitimate profile field updates still work
- [ ] No secrets in migration file
- [ ] `advisor-plans/README.md` row for 011 → DONE

## STOP conditions

- Latest migration number is not 198 / 199 already exists with different purpose — pick next number and report.
- Admin promote path in production depends on client UPDATE of `role` — STOP and report before blocking.
- Local Supabase is the wrong project stack.

## Maintenance notes

- Reviewers: confirm service_role still works for support ops.
- Follow-up: Plan 016 (narrow SELECT) is independent.
