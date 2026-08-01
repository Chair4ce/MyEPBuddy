# Plan 009: Extract shared EPB shell create helper for Entries fuse + EPB page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/components/entries/fuse-to-epb-dialog.tsx src/components/epb/epb-shell-form.tsx`
> If either file diverged substantially from the excerpts below, STOP and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — shell creation is a money/workflow-critical path
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

Entries "Fuse to EPB" (`fuse-to-epb-dialog.tsx`) copied the active-shell check + insert + sections fetch from `epb-shell-form.tsx` `handleCreateShell`. Two copies will drift (archive conflict, managed-member `user_id`/`team_member_id` rules, cycle-year math). One shared helper keeps create semantics identical for both entry points.

## Current state

- `src/components/entries/fuse-to-epb-dialog.tsx` — `createShell` (~lines 274–350) duplicates insert rules
- `src/components/epb/epb-shell-form.tsx` — `handleCreateShell` (~lines 1061–1175) is the canonical flow including archived-shell conflict dialog
- Cycle helpers live in `src/lib/constants.ts`: `getNextEpbShellCycleYear`, `getCycleRangeLabelForYear`

Conventions: match existing supabase client usage (`createClient` from `@/lib/supabase/client`), typed inserts via `as never`, analytics via `Analytics.epbShellCreated`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests     | `npx vitest run src/lib/__tests__/` (or project test script for new file) | pass |

## In scope

- New helper module under `src/lib/epb/` or `src/lib/epb-shell-create.ts` exporting something like:
  - `fetchActiveEpbShell(supabase, ratee)`
  - `createEpbShell(supabase, { ratee, profileId, cycleYear? })` returning shell+sections
  - Optional: `listEpbShellCycleYears`
- Refactor `fuse-to-epb-dialog.tsx` to call the helper
- Refactor `epb-shell-form.tsx` `handleCreateShell` to call the helper **while keeping** the archived-conflict dialog UI in the form (helper should return a typed conflict result, not toast)

## Out of scope

- Changing RLS / migrations
- OPB shell creation
- Fuse generate payload / Impact Booster UI
- Moving the archived-conflict React dialog itself into the lib

## Steps

1. Read both create implementations side by side; list every behavior difference (active-shell block, archived conflict, managed member insert shape, 100ms wait, analytics).
2. Implement helper with a result union, e.g. `{ status: "created", shell } | { status: "loaded_existing", shell } | { status: "archived_conflict", shellId, cycleYear } | { status: "active_exists" }`.
3. Wire fuse dialog: only handle `created` + error paths needed for Send; map `active_exists` to toast (same copy as EPB).
4. Wire EPB form: map `archived_conflict` into existing `setArchivedShellConflict`.
5. Typecheck.

## Done when

- [ ] Both call sites use the shared helper for insert + fetch
- [ ] Archived conflict still works on `/epb`
- [ ] Fuse "Create EPB & Send" still creates shell and writes the MPA section
- [ ] `npx tsc --noEmit` exits 0

## STOP conditions

- Helper would need server-only secrets or service role — STOP (client helper only)
- Discover create is already shared somewhere — STOP and report path instead of inventing a second abstraction

## Maintenance

Any new shell-create entry point (awards, onboarding) should import this helper — do not copy insert fields again.
