# Plan 023: Close the directory-enumeration hole that `search_profiles_directory` re-opened after migration 203

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 044b1be..HEAD -- supabase/migrations src/lib/profile-directory.ts src/components/library/share-statement-dialog.tsx src/components/epb/epb-shell-share-dialog.tsx src/components/award/award-shell-share-dialog.tsx src/components/decoration/decoration-shell-share-dialog.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches an RLS-adjacent SECURITY DEFINER function and four people-picker UIs
- **Depends on**: none (but land plan 021 first so `npm test` is a usable gate)
- **Category**: security
- **Planned at**: commit `044b1be`, 2026-08-01

## Why this matters

Migration `203_narrow_profiles_select_and_teams_insert.sql` replaced a
world-readable `profiles` SELECT policy (`USING (true)`) with a
relationship-scoped one. That was the right fix. But the same migration added a
`SECURITY DEFINER` escape hatch for people-pickers,
`search_profiles_directory(p_query text)`, whose own comment claims the table
"cannot be enumerated" — and it does not achieve that.

The function does an unanchored `ILIKE '%' || query || '%'` across
`full_name` **or** `email`, returns up to 10 rows, and has no per-caller
throttle. Any authenticated account can therefore walk the directory with
generic 3-character fragments (common name substrings, mail-domain fragments)
and harvest 10 fresh records per call, unbounded. Each record carries
`email`, `full_name`, `rank`, and `afsc`.

For this product that payload is the sensitive part: the combination of a `.mil`
address, real name, rank, and Air Force Specialty Code is exactly the roster
data the narrowed SELECT policy was written to protect. A single compromised or
throwaway account restores most of the pre-203 exposure. The bypass runs through
`SECURITY DEFINER`, so RLS never sees it.

The fix keeps the product feature (share dialogs must still find people you have
no relationship with yet) while making bulk harvesting useless: match on
**anchored name tokens or a full email address** rather than any substring, and
**stop returning raw emails and AFSCs** to a caller who has no relationship with
the person.

## Current state

### The function (`supabase/migrations/203_narrow_profiles_select_and_teams_insert.sql:310-342`)

```sql
CREATE OR REPLACE FUNCTION public.search_profiles_directory(p_query text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  rank public.user_rank,
  afsc text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.full_name, p.rank, p.afsc
  FROM profiles p
  WHERE auth.uid() IS NOT NULL
    AND length(btrim(p_query)) >= 3
    AND p.id <> auth.uid()
    AND (
      p.full_name ILIKE '%' || btrim(p_query) || '%'
      OR p.email ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY
    (lower(p.email) = lower(btrim(p_query))) DESC,
    p.full_name NULLS LAST
  LIMIT 10;
$$;
```

The sibling function `search_profile_by_email(p_email text)` (same migration,
lines 279–299) is **fine on the enumeration axis** — it requires the full
address — but it returns `unit` and `afsc` on top of name and rank, which is
more than its callers use.

### The client wrapper (`src/lib/profile-directory.ts`)

Single, well-factored module. Types at lines 25–35:

```ts
export interface DirectoryProfile {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
  afsc: string | null;
}

export interface EmailMatchProfile extends DirectoryProfile {
  unit: string | null;
}
```

`searchProfilesDirectory()` (lines 74–92) guards on
`PROFILE_SEARCH_MIN_QUERY_LENGTH = 3` and calls the RPC with `p_query`.

### The four consumers of `searchProfilesDirectory`

- `src/components/library/share-statement-dialog.tsx:134`
- `src/components/epb/epb-shell-share-dialog.tsx:225`
- `src/components/award/award-shell-share-dialog.tsx:219`
- `src/components/decoration/decoration-shell-share-dialog.tsx:231`

All four render the same two-line row — rank + name on top, **raw email
underneath** as the disambiguator. Example,
`src/components/library/share-statement-dialog.tsx:402-409`:

```tsx
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {user.rank} {user.full_name || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                            </div>
```

The email line exists to tell two people with the same name apart. A masked
address (`j***@us.af.mil`) preserves that affordance without shipping the
address itself.

### Consumers of `searchProfileByEmail`

`src/lib/managed-member-create.ts`, `src/components/team/add-managed-member-dialog.tsx`,
`src/components/team/edit-managed-member-dialog.tsx`, `src/app/(app)/team/page.tsx`,
`src/app/api/team/invite-managed-member/route.ts`. Spot-checking those call sites
shows they consume `id`, `full_name`, and `rank` (e.g.
`src/lib/managed-member-create.ts:38-39`, `add-managed-member-dialog.tsx:225-226`).
`unit` and `afsc` look unused — **verify with grep in step 1 rather than
assuming**.

### Repo conventions

- **Migrations**: numbered sequentially, no gaps, next free number is **`204`**
  (highest existing is `203_narrow_profiles_select_and_teams_insert.sql`). Name
  the file `204_harden_profile_directory_search.sql`. Follow the header-comment
  style of migration 203: a `-- Problem / -- Fix` preamble, then `-- ====` banner
  sections.
- **Applying migrations** (operator rule, non-negotiable): confirm the *correct*
  local stack is up first — `supabase/config.toml` has `project_id = "myepbuddy"`,
  so `docker ps` must show `supabase_db_myepbuddy` and `supabase status` must
  succeed. Then `npm run db:push:local` (`supabase db push --local`). Only after
  that succeeds may you run `npm run db:push:remote`. Never apply migrations with
  any other CLI.
- **Function hardening style**: migration 203 ends every function with
  `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` followed by an explicit
  `GRANT EXECUTE ... TO authenticated;`. Match it.
- **Regression harness**: `scripts/verify-016-rls.sql` is the existing pattern for
  a SQL check script (a series of assertions run against the local DB). Extend
  that file or add `scripts/verify-023-directory-search.sql` in the same style.
- **Unit tests**: colocated in `src/lib/__tests__/*.test.ts`, vitest. See
  `src/lib/__tests__/assessment-coaching.test.ts` for the shape.

## Commands you will need

| Purpose            | Command                                        | Expected on success            |
|--------------------|------------------------------------------------|--------------------------------|
| Verify local stack | `supabase status`                               | succeeds, API `54321`, DB `54322` |
| Verify container   | `docker ps --format '{{.Names}}' \| grep supabase_db_myepbuddy` | one match |
| Push local         | `npm run db:push:local`                         | applies `204_*`, exit 0        |
| Push remote        | `npm run db:push:remote`                        | exit 0 (only after local)      |
| Typecheck          | `npx tsc --noEmit`                              | exit 0                         |
| Tests              | `npm test`                                      | exit 0 (see STOP note)         |
| Lint               | `npm run lint`                                  | exit 0                         |

## Scope

**In scope**:

- `supabase/migrations/204_harden_profile_directory_search.sql` (create)
- `scripts/verify-023-directory-search.sql` (create)
- `src/lib/profile-directory.ts`
- `src/lib/__tests__/profile-directory.test.ts` (create)
- The four share dialogs listed above — **only** the line that renders
  `user.email` in the search-results list
- `advisor-plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- The `profiles` SELECT policy and `can_view_profile()` from migration 203.
  They are correct; this plan hardens the RPC that sits beside them. Do not
  loosen either one to compensate.
- `search_profile_by_email`'s matching logic — exact-email matching is the
  intended design for invite flows. You may narrow its **returned columns**
  (step 4) but not how it matches.
- Rows the caller already has a relationship with. Do **not** try to route the
  share dialogs through `can_view_profile` — the whole point of the picker is
  finding people you have no relationship with yet.
- Building generic rate-limit infrastructure. There is none in this repo today
  (`rg -l 'rate_limit' supabase/migrations` returns nothing) and inventing a
  throttle table is a bigger project than this fix. See Maintenance notes.
- `src/components/epb/mpa-section-card.tsx`, the EPB MPA split view, and
  sentence drag-and-drop. Operator lock.

## Git workflow

- Branch: `advisor/023-harden-profile-directory-search`
- Commit style matches `git log`: one imperative sentence ending in a period,
  e.g. `Anchor directory search matching and mask emails for strangers.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm which columns the callers actually need

```bash
rg -n "searchProfileByEmail|searchProfilesDirectory" src/ -A 15 | rg -n "\.unit|\.afsc|\.email"
```

Write down every consumer that reads `.unit`, `.afsc`, or `.email` off a
directory/email-match result. You will need this in steps 4 and 5.

**Verify**: you have an explicit list. If any consumer genuinely needs `unit` or
raw `email` from `search_profiles_directory` for a **stranger** (not just for
display disambiguation), STOP and report — it changes the design.

### Step 2: Write migration `204`

Create `supabase/migrations/204_harden_profile_directory_search.sql`.

**2a — anchored matching.** Replace `search_profiles_directory` so a row can
only match one of:

- the query is a full email address (`position('@' in q) > 1`) and
  `lower(p.email) = lower(q)`; or
- the query anchors the **start of a name token**:
  `p.full_name ILIKE q || '%'` OR `p.full_name ILIKE '% ' || q || '%'`.

Drop the bare `p.email ILIKE '%' || q || '%'` branch entirely — that branch is
what makes mail-domain harvesting work.

**2b — narrowed payload.** Change the return type to
`(id uuid, full_name text, rank public.user_rank, email_hint text)`:

- Remove `afsc` from the result set.
- Replace `email` with a masked `email_hint`, computed in SQL, e.g.
  `left(split_part(p.email, '@', 1), 1) || '***@' || split_part(p.email, '@', 2)`.
  Guard against an email with no `@` (fall back to `'***'`).

**2c — keep the existing guards.** Preserve `auth.uid() IS NOT NULL`,
`length(btrim(p_query)) >= 3`, `p.id <> auth.uid()`, `LIMIT 10`, `STABLE`,
`SECURITY DEFINER`, `SET search_path = public, pg_temp`, and the
`REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` pair.

**2d — trim `search_profile_by_email`.** Drop `unit` and `afsc` from its
`RETURNS TABLE` **only if** step 1 confirmed no caller reads them. If a caller
does, leave that column and say so in your report.

Because `RETURNS TABLE` changes, you must `DROP FUNCTION IF EXISTS` before
`CREATE` (Postgres rejects a `CREATE OR REPLACE` that changes the output
signature). Drop with the exact argument type, e.g.
`DROP FUNCTION IF EXISTS public.search_profiles_directory(text);`.

**Verify**: local stack check, then `npm run db:push:local` → exit 0. Do not run
the remote push yet.

### Step 3: Write the SQL regression checks

Create `scripts/verify-023-directory-search.sql` following the style of
`scripts/verify-016-rls.sql`. Assert at least:

1. A 3-char fragment matching the **middle** of an email local part returns 0 rows.
2. A mail-domain fragment (e.g. the characters after `@`) returns 0 rows.
3. A full email address returns exactly the 1 matching row.
4. A name-token prefix (first characters of a first or last name) returns the
   expected row.
5. A 3-char fragment matching the **middle** of a name token returns 0 rows.
6. No returned column is a raw email address (the `email_hint` value contains
   `'***'`).
7. The caller's own row is never returned.

**Verify**: run it against the local DB (the header of
`scripts/verify-016-rls.sql` documents how that script is invoked — use the
same invocation) → every assertion passes.

### Step 4: Update the client wrapper

In `src/lib/profile-directory.ts`:

- Change `DirectoryProfile` to `{ id: string; full_name: string | null; rank: Rank | null; email_hint: string }`.
- Keep `EmailMatchProfile` as its own interface (it is a different RPC with a
  different, exact-match contract); adjust its fields to whatever step 2d left.
- Do not change `PROFILE_SEARCH_MIN_QUERY_LENGTH` or the early-return guard.
- Update the module doc comment at lines 5–13 to describe the new matching rule
  ("anchored name token or full email address; returns a masked email hint").

**Verify**: `npx tsc --noEmit` → it will now fail in the four dialogs. That is
expected and is your worklist for step 5.

### Step 5: Update the four pickers to render the hint

In each of the four dialogs, change only the email line in the search-results
list from `{user.email}` to the masked hint. Keep the classes and layout exactly
as they are — do not restyle, and do not touch the *selected users* list, which
renders profiles the caller has a real relationship with and is unaffected.

Where a dialog casts the RPC result to `Profile` (e.g.
`setSearchResults(data as unknown as Profile[])` in
`share-statement-dialog.tsx:136`), replace the cast with the real
`DirectoryProfile` type rather than widening the cast — the cast is what let the
type change slip past the compiler.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: Unit-test the wrapper

Create `src/lib/__tests__/profile-directory.test.ts` (vitest, modeled on
`src/lib/__tests__/assessment-coaching.test.ts`). With a stub client object
`{ rpc: vi.fn() }`:

- `searchProfilesDirectory` returns `[]` and does **not** call the RPC for a
  1- and 2-character query.
- It trims the query before sending (`"  abc  "` → `p_query: "abc"`).
- It throws when the RPC returns an error.
- `searchProfileByEmail` returns `null` for input without `@`, and lowercases
  and trims before sending.

**Verify**: `npx vitest run src/lib/__tests__/profile-directory.test.ts` → all pass.

### Step 7: Gates, then remote push

- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm test` → exit 0 (see STOP conditions)
- `npm run motion:check` → exit 0, no regressions
- Manual smoke: open any share dialog, type 3+ characters of a first name →
  results appear with a masked email under the name; type a mail-domain
  fragment → no results.

Only after all of the above pass: `npm run db:push:remote`.

## Test plan

- New: `src/lib/__tests__/profile-directory.test.ts` — the five wrapper cases in
  step 6. Pattern: `src/lib/__tests__/assessment-coaching.test.ts`.
- New: `scripts/verify-023-directory-search.sql` — the seven SQL assertions in
  step 3. Pattern: `scripts/verify-016-rls.sql`.
- The SQL script is the load-bearing test here: the enumeration property lives in
  the function body, not in TypeScript, so a mocked unit test cannot prove it.
- Verification: `npm test` → 0 failed; the verify script → all assertions pass.

## Done criteria

ALL must hold:

- [ ] `supabase/migrations/204_harden_profile_directory_search.sql` exists and
      applied cleanly to local, then remote
- [ ] `rg -n "email ILIKE '%'" supabase/migrations/204*.sql` returns no matches
- [ ] `rg -n "afsc" supabase/migrations/204*.sql` returns no matches inside the
      `search_profiles_directory` result set
- [ ] `scripts/verify-023-directory-search.sql` passes all assertions locally
- [ ] `rg -n "user\.email" src/components/library/share-statement-dialog.tsx src/components/epb/epb-shell-share-dialog.tsx src/components/award/award-shell-share-dialog.tsx src/components/decoration/decoration-shell-share-dialog.tsx`
      shows no raw-email render inside a **search-results** list
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0, including the new `profile-directory.test.ts`
- [ ] `npm run lint` exits 0
- [ ] `npm run motion:check` exits 0 with no regressions
- [ ] `advisor-plans/README.md` row for 023 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `supabase status` fails, or `docker ps` shows a Supabase stack whose container
  name is **not** `supabase_db_myepbuddy`. Never push a migration into another
  project's local database — start this project's stack from the repo root
  instead, and if the ports are taken, stop and report.
- Step 1 finds a caller that needs a raw stranger email or AFSC from
  `search_profiles_directory`. The design changes; report before proceeding.
- The remote push fails after the local push succeeded. Do not retry blindly and
  do not hand-apply SQL through any other tool; report the error.
- `npm test` fails with anything other than the known pre-existing
  `src/lib/__tests__/assessment-coaching.test.ts` failure (fixed by plan 021).
- Anchored matching turns out to break a real workflow you can observe in the
  smoke test (e.g. users are routinely found by last-name substring because
  `full_name` is stored `"Last, First"`). Report what you saw and propose the
  adjusted matching rule rather than reverting to `%q%`.

## Maintenance notes

- **Reviewer should scrutinize**: that `search_profiles_directory` is still
  `SECURITY DEFINER` with `SET search_path = public, pg_temp` and still
  `REVOKE`d from `PUBLIC`; that the `DROP FUNCTION` in migration 204 names the
  exact signature; and that no share dialog quietly regained a raw email render.
- **Known residual risk, deliberately not fixed here**: an authenticated caller
  can still confirm whether a *specific guessed* email or name-prefix belongs to
  an account. That is inherent to any invite-by-email flow and is the accepted
  tradeoff. What this plan removes is *bulk* harvesting.
- **Deferred follow-up**: a per-user call budget on the directory RPC (e.g. a
  `profile_search_log` table plus a count check inside the function, mirroring
  how migration 201 pinned burst limits on `consume_credit`). Worth doing if
  directory search ever becomes an abuse vector; out of scope here because the
  repo has no rate-limit primitive to build on yet.
- If a future feature needs richer stranger data in the picker (unit, AFSC),
  gate it behind an explicit relationship rather than widening this RPC.
