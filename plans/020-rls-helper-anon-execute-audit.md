# Plan 020: Keep RLS helper EXECUTE grants aligned with PUBLIC policies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9e64823..HEAD -- supabase/migrations/`
> If migration 210 was renamed/split or new PUBLIC-policy helpers were added
> since this plan was written, re-audit before adding grants.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (migration 210 on branch `cursor/fix-chain-fn-execute-grants-dd9a` already restores the known PUBLIC-policy helpers)
- **Category**: security / migration
- **Planned at**: commit `9e64823`, 2026-08-05

## Why this matters

Migration `101` revoked `EXECUTE` from `anon` on every public function. Any helper later (or already) called from a **PUBLIC** RLS policy will log `42501 permission denied for function …` for unauthenticated reads instead of returning zero rows. Migration `203` fixed `can_view_profile`; migration `210` restores the rest of the known PUBLIC entrypoints. This plan is the **regression checklist** so future SECURITY DEFINER helpers do not reintroduce the gap.

## Current state

- Pattern exemplar: `supabase/migrations/203_narrow_profiles_select_and_teams_insert.sql` (comments + `GRANT … TO anon, authenticated, service_role` for `can_view_profile`).
- Fix migration: `supabase/migrations/210_restore_chain_helper_execute_grants.sql` grants anon EXECUTE on:
  - `get_subordinate_chain(uuid)`
  - `get_supervisor_chain(uuid)`
  - `can_view_team_member(uuid,uuid,uuid,uuid,uuid)`
  - `get_visible_managed_members(uuid,integer)`
  - `is_project_member(uuid,uuid)`
  - `is_project_owner(uuid,uuid)`
  - `count_project_owners(uuid)`
  - `can_add_project_member(uuid,uuid,uuid,uuid)`
  - `is_in_accomplishment_chain(uuid,uuid)`
  - `user_can_access_shell(uuid,uuid)`
- Intentionally **not** granted to anon (policies are `TO authenticated` only):
  - `is_direct_supervisor_of_team_member(uuid,uuid)` — `196_fix_pending_managed_links_rls_recursion.sql`
  - `user_has_pending_link_to_team_member(uuid,uuid)` — same migration

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm stack | `grep project_id supabase/config.toml` + `supabase status` + `docker ps \| grep supabase_db_myepbuddy` | project_id `myepbuddy`, status OK, db container running |
| Push local | `supabase db push --local` | migration 210 applied, exit 0 |
| Push remote | `supabase db push` | exit 0 (only after local) |
| Spot-check grants | `supabase db query --local "select … has_function_privilege …"` (see Step 2) | anon EXECUTE = true for helpers in 210 |

## Steps

### Step 1 — Apply migration 210 (if not already on the target DB)

1. Verify MyEPBuddy local stack (ports 54321/54322, container `supabase_db_myepbuddy`).
2. `supabase db push --local`
3. On success only: `supabase db push`

**Verify**: `supabase migration list` shows `210` applied locally (and remotely after the second push).

### Step 2 — Confirm anon EXECUTE on PUBLIC-policy helpers

Run against local:

```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_subordinate_chain', 'get_supervisor_chain', 'can_view_team_member',
    'get_visible_managed_members', 'is_project_member', 'is_project_owner',
    'count_project_owners', 'can_add_project_member',
    'is_in_accomplishment_chain', 'user_can_access_shell', 'can_view_profile'
  )
ORDER BY 1;
```

**Expected**: every row `anon_exec = t`.

### Step 3 — Future-helper checklist (no code unless a gap is found)

When adding a new SECURITY DEFINER helper used in `CREATE POLICY` **without** `TO authenticated` / `TO service_role`:

1. After `CREATE OR REPLACE FUNCTION`, immediately:
   ```sql
   REVOKE ALL ON FUNCTION public.<name>(…) FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION public.<name>(…) TO anon, authenticated, service_role;
   ```
2. If the policy is `TO authenticated` only, grant authenticated (+ service_role if RPC) — **not** anon.
3. Never rely on migration 101’s blanket `GRANT EXECUTE … TO authenticated` alone for PUBLIC policies after a later `REVOKE ALL … FROM PUBLIC`.

If Step 2 finds any `anon_exec = f` for a helper still referenced from a PUBLIC policy, add a new incremental migration (next number after the latest in `supabase/migrations/`) using the same GRANT pattern — do not edit 210 after it has been pushed to any environment.

## STOP conditions

- Wrong Supabase project / ports — do not `db push`.
- Function signature mismatch on `GRANT` (e.g. `get_visible_managed_members` must be `(uuid, integer)` after migration 102) — STOP and re-check `pg_proc`.
- Temptation to grant anon EXECUTE on credit/grant/admin RPCs — STOP; those must stay service_role-only.

## Out of scope

- Changing RLS policy logic or SECURITY DEFINER bodies
- Granting anon EXECUTE on functions only used from `TO authenticated` policies
- React/UI changes
- Editing already-applied migrations 101/203/210

## Done criteria

- [ ] Migration 210 applied local then remote (or confirmed already applied)
- [ ] Step 2 query shows `anon_exec = t` for every listed helper
- [ ] `plans/README.md` row for 020 marked DONE
