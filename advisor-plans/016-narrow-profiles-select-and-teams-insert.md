# Plan 016: Narrow world-readable profiles SELECT + require consent for teams INSERT

> **Drift check**: `git diff --stat 71a367e..HEAD -- supabase/migrations src/components/team src/app/actions`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (coordinate migration numbers with 011/014/015)
- **Category**: security
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

1. Profiles SELECT policy `"Users can search profiles by email"` uses `USING (true)` → every authed user can read all profiles (email, PII, who is admin).
2. Teams INSERT allows `supervisor_id = auth.uid() OR subordinate_id = auth.uid()` without an accepted `team_requests` row → user A can attach B into their chain without consent.

## Current state

- Profiles: `supabase/migrations/007_team_requests_and_chain.sql:2-8` drops prior SELECT policies and adds world-readable search.
- Teams insert: `008_fix_teams_insert_policy.sql:10-14` / `061_*:481-483`.
- Consent table: `team_requests` already exists for accept/reject flows.
- Team invite UI: `src/components/team/` — must keep email lookup working via a constrained RPC.

## Scope

**In scope**:
- Migration(s) replacing profiles SELECT + teams INSERT policies
- `SECURITY DEFINER` function e.g. `search_profile_by_email(email text)` returning minimal columns (`id`, `full_name`, `email`, `rank`) for exact match only
- Update team invite client to call the RPC instead of `from('profiles').select(...).ilike(...)` if that pattern exists

**Out of scope**: Plan 011 role freeze (separate); managed-member invite tokens redesign.

## Steps

### Step 1: Inventory client profile search

`rg -n "from\\(\"profiles\"\\)" src/components/team src/app --glob '*.tsx' | head -40`

Document every SELECT that needs the search RPC.

### Step 2: Migration

1. Drop `USING (true)` profiles SELECT.
2. Restore own-row + supervisor/chain SELECT policies consistent with current chain helpers (match patterns in later migrations — search `profiles FOR SELECT`).
3. Add `search_profile_by_email` SECURITY DEFINER, `GRANT EXECUTE TO authenticated`, exact/ilike-as-product-requires but **not** full table dump.
4. Replace teams INSERT policy to require an accepted `team_requests` row (or only allow insert via existing accept RPC). Prefer single SECURITY DEFINER `accept_team_request` that inserts `teams` if not already the case — check current accept path first.

**Verify**: Local push; authed user cannot `select * from profiles` all rows; email search RPC returns one match; teams insert without request fails.

### Step 3: Update clients

Point invite/search UI at the RPC. Typecheck + smoke invite flow.

## Done criteria

- [x] No world-readable profiles SELECT
- [x] No unsupervised teams INSERT
- [x] Invite/search still works
- [x] README 016 → DONE

## Outcome (migration `203_narrow_profiles_select_and_teams_insert.sql`, local + remote)

- `can_view_profile(uuid)` SECURITY DEFINER predicate enumerates every existing
  relationship (chain both directions, co-supervisors, prior supervision,
  invitations, managed links, the five share tables, authored content, shells,
  feedback, award requests, projects, live collaboration, admin). `profiles`
  SELECT is `id = auth.uid() OR can_view_profile(id)`.
- `search_profile_by_email` (exact, 1 row) and `search_profiles_directory`
  (min 3 chars, max 10 rows, directory columns) replace the client-side scans.
  This also removes the interpolated PostgREST `or=` filters in the share
  dialogs, which were a filter-injection vector.
- `respond_to_team_request(uuid, boolean)` makes accept/decline atomic and
  target-only; `teams` INSERT now requires an accepted `team_requests` row for
  the exact pair. `accept_supervisor_from_link` (migration 028) is unaffected.
- Verified with `scripts/verify-016-rls.sql` (13 checks, all passing).

## STOP conditions

- Accept flow already inserts via service role and client INSERT is unused — then only drop/tighten INSERT and skip RPC redesign for teams.
- Search UX requires substring scan across all emails for UX reasons — propose paginated RPC; do not restore `USING (true)`.

## Maintenance notes

High-risk RLS change — test supervisor accomplishment visibility after policy swap.
