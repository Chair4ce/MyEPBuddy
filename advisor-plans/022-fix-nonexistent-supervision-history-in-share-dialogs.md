# Plan 022: Fix the nonexistent `supervision_history` query that silently blanks supervisors in the EPB and Award share dialogs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 044b1be..HEAD -- src/components/epb/epb-shell-share-dialog.tsx src/components/award/award-shell-share-dialog.tsx src/components/decoration/decoration-shell-share-dialog.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `044b1be`, 2026-08-01

## Why this matters

The EPB and Award "Share" dialogs build a **who can see this document** access
list from three sources: the ratee/nominee, the shell owner, and the ratee's
current supervisors. The supervisor lookup queries a relation named
`supervision_history` — **which does not exist in this database**. The only
thing by that name is a *view* called `my_supervision_history`
(`supabase/migrations/033_supervision_history_sync.sql:189`, recreated with
`security_invoker` in `066_fix_security_definer_views_and_search_path.sql:38`).
The real table is `team_history` (`supabase/migrations/027_supervisor_visibility_and_provenance.sql:32`).

PostgREST answers a query against an unknown relation with an error, and both
call sites destructure only `{ data: supervisionData }` — the error is thrown
away. The result is a silent, permanent empty supervisors array: the access
list under-reports who can see the EPB/Award package, with no error toast and
nothing in the console.

This matters beyond cosmetics. The share dialog is the surface a supervisor uses
to answer "who else can read this?" before sharing performance content. An
access list that silently omits the chain is a privacy-decision surface giving a
wrong answer. The **decoration** share dialog and the entries supervisor-feedback
panel already do this correctly against `team_history`, so this is a
copy-paste divergence with a known-good exemplar in the repo, not a design
question.

The same two call sites also filter on `.is("end_date", null)`, another column
that does not exist — `team_history`'s active-relationship marker is
`ended_at`.

## Current state

Broken call site 1 — `src/components/epb/epb-shell-share-dialog.tsx:108-127`:

```tsx
        let nextSupervisors: Profile[] = [];
        if (ratee && !ratee.isManagedMember) {
          const { data: supervisionData } = await supabase
            .from("supervision_history")
            .select(`
              supervisor:profiles!supervision_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `)
            .eq("subordinate_id", ratee.id)
            .is("end_date", null)
            .abortSignal(controller.signal);

          const typedSupervisionData = supervisionData as { supervisor: Profile }[] | null;
          if (typedSupervisionData) {
            nextSupervisors = typedSupervisionData
              .map((s) => s.supervisor)
              .filter(Boolean);
          }
        }
```

Broken call site 2 — `src/components/award/award-shell-share-dialog.tsx:110-129`:
identical shape, except the guard variable is `nominee` instead of `ratee`
(`if (nominee && !nominee.isManagedMember)` and `.eq("subordinate_id", nominee.id)`).

Known-good exemplar — `src/components/decoration/decoration-shell-share-dialog.tsx:121-142`:

```tsx
        let nextSupervisors: Profile[] = [];
        if (ratee && !ratee.isManagedMember) {
          const { data: supervisionData } = await supabase
            .from("team_history")
            .select(
              `
              supervisor:profiles!team_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `
            )
            .eq("subordinate_id", ratee.id)
            .is("ended_at", null)
            .abortSignal(controller.signal);

          const typedSupervisionData = supervisionData as { supervisor: Profile }[] | null;
          if (typedSupervisionData) {
            nextSupervisors = typedSupervisionData
              .map((s) => s.supervisor)
              .filter(Boolean);
          }
        }
```

Second exemplar (same table, same FK alias) —
`src/components/entries/supervisor-feedback-panel.tsx:112-118`.

Schema facts you can rely on (from the generated types,
`src/types/supabase.ts:2814-2836`): `team_history` has columns
`id, subordinate_id, supervisor_id, started_at, ended_at, supervision_start_date,
supervision_end_date, source_team_member_id, created_at`, and the foreign key
constraint name for the supervisor join is `team_history_supervisor_id_fkey`.
There is **no** `supervision_history` entry under `Tables` or `Views` in that
file — only `my_supervision_history` at line 3566.

Repo conventions that apply:

- These dialogs already use `AbortController` + `.abortSignal(controller.signal)`
  and the shared `isAbortError()` guard; keep that pattern.
- Real errors on the other two queries in the same effect are surfaced with
  `console.error("Failed to load access:", shellError ?? sharesError)`
  (`epb-shell-share-dialog.tsx:130-133`). Match that style for the new
  supervisor error handling.
- RLS note (do not "fix" this): the embedded `profiles!...` join is filtered by
  the `profiles` SELECT policy added in migration
  `203_narrow_profiles_select_and_teams_insert.sql`. A prior or current
  supervisor of a ratee you can see is covered by the `teams` and `team_history`
  branches of `can_view_profile()`, so the join will resolve. Do not add a
  service-role path.

## Commands you will need

| Purpose   | Command                                    | Expected on success        |
|-----------|--------------------------------------------|----------------------------|
| Typecheck | `npx tsc --noEmit`                          | exit 0, no output          |
| Tests     | `npm test`                                  | exit 0 (see STOP note)     |
| Lint      | `npm run lint`                              | exit 0                     |
| Motion    | `npm run motion:check`                      | exit 0, no *regressions*   |
| Grep gate | `rg -n "supervision_history" src/`          | only `my_supervision_history` hits |

## Scope

**In scope** (the only files you should modify):

- `src/components/epb/epb-shell-share-dialog.tsx`
- `src/components/award/award-shell-share-dialog.tsx`
- `advisor-plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/components/decoration/decoration-shell-share-dialog.tsx` — already
  correct; it is the exemplar, not a target.
- `src/app/(app)/team/page.tsx:1511` — reads the `my_supervision_history`
  **view**, which does exist. Leave it alone.
- `supabase/migrations/**` — this is a client bug, not a schema bug. Do not add
  a `supervision_history` table or view to make the broken query work.
- `src/components/epb/mpa-section-card.tsx` and any EPB split-view or sentence
  drag-and-drop code. Operator lock; not needed for this fix.
- Extracting the three near-identical share dialogs into a shared component.
  Real debt, deliberately deferred (see Maintenance notes).

## Git workflow

- Branch: `advisor/022-fix-supervision-history-share-dialogs`
- Commit style matches `git log`: one imperative sentence ending in a period,
  e.g. `Query team_history for share-dialog supervisors instead of a missing relation.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prove the relation does not exist

Run:

```bash
rg -n "supervision_history" src/types/supabase.ts
rg -n "supervision_history" supabase/migrations/
```

**Verify**: the only hits are `my_supervision_history` (a view). There is no
`CREATE TABLE ... supervision_history` and no `supervision_history:` key under
`Tables` in the generated types. If a `supervision_history` **table** does turn
up, treat it as a STOP condition — the premise of this plan is wrong.

### Step 2: Fix the EPB share dialog

In `src/components/epb/epb-shell-share-dialog.tsx`, replace the supervisor
lookup at lines 108–127 so that it matches the decoration exemplar:

- `.from("supervision_history")` → `.from("team_history")`
- `supervisor:profiles!supervision_history_supervisor_id_fkey(` →
  `supervisor:profiles!team_history_supervisor_id_fkey(`
- `.is("end_date", null)` → `.is("ended_at", null)`
- Destructure the error too and log it, so the next schema drift is not silent:

```tsx
          const { data: supervisionData, error: supervisionError } = await supabase
            .from("team_history")
            .select(`
              supervisor:profiles!team_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `)
            .eq("subordinate_id", ratee.id)
            .is("ended_at", null)
            .abortSignal(controller.signal);

          if (supervisionError && !isAbortError(supervisionError)) {
            console.error("Failed to load supervisors:", supervisionError);
          }
```

Keep the existing `typedSupervisionData` mapping below it unchanged. Do **not**
`return` early on `supervisionError` — a supervisor-lookup failure should
degrade to "no supervisors listed", not blank the whole access list.

`isAbortError` is already imported in this file; confirm with
`rg -n "isAbortError" src/components/epb/epb-shell-share-dialog.tsx`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Fix the Award share dialog

Apply the identical change in `src/components/award/award-shell-share-dialog.tsx`
at lines 110–129. The only differences from step 2: the guard is
`if (nominee && !nominee.isManagedMember)` and the filter is
`.eq("subordinate_id", nominee.id)`. Do not rename `nominee` to `ratee`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Confirm no other call site has the same defect

```bash
rg -n 'from\("supervision_history"\)' src/
rg -n 'supervision_history_supervisor_id_fkey' src/
rg -n '\.is\("end_date", null\)' src/
```

**Verify**: all three return **no matches**. If the third one hits a file that
queries a table which genuinely has an `end_date` column, leave that file alone
and note it in your report.

### Step 5: Full gates

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm run motion:check` → exits 0 (it may print an advisory backlog list; that
  is expected — it must not print "regression(s) on house-motion surfaces")
- `npm test` → see STOP conditions about the pre-existing failure

## Test plan

There is no route/component test harness in this repo for these dialogs
(`rg --files -g '*.test.ts*' src/components` returns nothing), and adding one is
out of scope. Verification is therefore static plus a manual smoke:

- Static: the three greps in step 4 return no matches, and `npx tsc --noEmit`
  passes.
- Manual smoke (do this if a dev environment is available; report if not):
  1. `npm run dev`
  2. Sign in as a user who supervises at least one subordinate with an EPB shell.
  3. Open `/epb` for that subordinate → Share dialog.
  4. **Expected**: the access list now shows a "supervisor" row for each active
     `team_history` supervisor of the ratee. Before this fix, that section was
     always empty.
  5. Repeat on `/award` for a nominee with an award shell.

Do not add a mocked Supabase unit test for this; the whole value of the fix is
that the *real* relation name is correct, which a mock cannot verify.

## Done criteria

ALL must hold:

- [ ] `rg -n 'from\("supervision_history"\)' src/` returns no matches
- [ ] `rg -n 'supervision_history_supervisor_id_fkey' src/` returns no matches
- [ ] `rg -n '\.is\("end_date", null\)' src/` returns no matches
- [ ] Both dialogs log a supervisor-lookup error instead of discarding it
      (`rg -n "Failed to load supervisors" src/components | wc -l` returns `2`)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run motion:check` exits 0 with no regressions
- [ ] Only the two dialog files (plus `advisor-plans/README.md`) are modified
- [ ] `advisor-plans/README.md` row for 022 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds an actual `supervision_history` table or view (other than
  `my_supervision_history`) — the query may be valid against a remote schema
  that the local migrations do not describe, which is a much bigger finding.
- The excerpts in "Current state" do not match the live code.
- `npm test` fails with anything **other than** the single known pre-existing
  failure in `src/lib/__tests__/assessment-coaching.test.ts` (that one is
  addressed by plan 021 and is not your problem). A new failure means you broke
  something — stop.
- Fixing this appears to require a migration, a service-role client, or a change
  to the `profiles` RLS policy from migration 203. It does not.

## Maintenance notes

- **Reviewer should scrutinize**: that the FK alias in the `select()` string
  exactly matches the constraint name `team_history_supervisor_id_fkey`
  (PostgREST resolves embeds by constraint name; a typo fails at runtime, not at
  compile time — that is precisely how this bug survived).
- These three share dialogs (`epb-shell-share-dialog.tsx`,
  `award-shell-share-dialog.tsx`, `decoration-shell-share-dialog.tsx`) are ~90%
  identical and have now drifted twice. The right follow-up is a shared
  `useShellAccessList({ table, shellId, subject })` hook, deliberately deferred
  out of this plan so the bug fix stays reviewable.
- If a `supervision_history` table is ever introduced for real, revisit
  `my_supervision_history` (the view) and `src/app/(app)/team/page.tsx:1511`
  so the naming stops being ambiguous.
