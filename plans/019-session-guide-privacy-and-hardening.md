# Plan 019: Harden Midterm/Final session guide (privacy, remigration, billing, races, EPB errors, tests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — the reviewer
> maintains the index. Work in the **existing dirty workspace** at
> `/Users/jacyhoag/Workspace/myepbuddy` (do NOT create a fresh worktree from
> HEAD — the in-scope files are largely uncommitted). Do not commit unless
> the reviewer asks. Do not use `useEffect` anywhere.
>
> **Drift check (run first)**: Confirm these files exist:
> `src/components/team/session-guide-phase-editor.tsx`,
> `src/components/team/expectations-feedback-dialog.tsx`,
> `src/app/api/generate-feedback-session-guide/route.ts`,
> `src/lib/feedback-session-guide-loaders.ts`.
> If missing, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (supersedes stale parts of plan 018 for this wave)
- **Category**: security | bug | tests
- **Planned at**: commit `2ec396a` + uncommitted session-guide work, 2026-07-21
- **Covers audit findings**: 1–7 from improve pass (session-guide EPB/ACA work)
- **Execution status**: DONE (2026-07-21) — executor + advisor review; 1 revision for activePane remigration; TEST GAP: no API route harness tests

## Why this matters

Midterm/Final Feedback Session Guide treats `session_settings` as private form-prep, but ratee shared reads still return that column. Client remigration heuristics can wipe a generated guide into settings. Generate/Revise skip `billableFetch` idempotency. Dialog loads can race across ratees. Unsaved drafts die on step change. Final EPB loader failures look like empty packages. Prompt unit tests alone do not guard authz or Final-requires-EPB.

## Current state

- `src/app/actions/supervisor-feedbacks.ts` — `getMyReceivedFeedbacks` selects `*` and maps `session_settings` (≈144–174). Ratee panel uses this (`supervisor-feedback-panel.tsx`).
- `src/components/team/session-guide-phase-editor.tsx` — remigration when settings empty and content includes `"Performance assessment"` / `"Knowing your Airman"` / `"Session Guide"` (≈115–148); Generate/Revise use plain `fetch` (≈296+, ≈373+).
- `src/components/team/expectations-feedback-dialog.tsx` — `loadFeedbacks` / `loadEvidence` / `loadEpbPackage` without generation tokens; editor remounts via `key={activeStep-…}`.
- `src/lib/feedback-session-guide-loaders.ts` — `loadFeedbackEpbStatements` returns `null` on query error or missing row (≈231–232).
- Exemplar for billable LLM client calls: `src/components/generate/custom-context-workspace.tsx` uses `billableFetch` from `@/lib/fetch-with-retry`.
- Repo rules: no `useEffect`; Tailwind + existing shadcn; match nearby patterns.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npx vitest run src/lib/__tests__/feedback-session-guide-generate.test.ts src/lib/__tests__/feedback-session-guide-loaders.test.ts src/lib/__tests__/feedback-aca-strengths-weaknesses.test.ts src/app/actions/__tests__/supervisor-feedbacks-received.test.ts` | all pass (create missing test files as specified) |
| React Doctor | `npx react-doctor@latest --verbose --scope changed` | no new error-severity in changed UI |

## Scope

**In scope**:
- `src/app/actions/supervisor-feedbacks.ts`
- `src/components/team/session-guide-phase-editor.tsx`
- `src/components/team/expectations-feedback-dialog.tsx`
- `src/lib/feedback-session-guide-loaders.ts`
- `src/app/api/generate-feedback-session-guide/route.ts`
- `src/lib/__tests__/feedback-session-guide-loaders.test.ts` (create)
- `src/app/actions/__tests__/supervisor-feedbacks-received.test.ts` (create) — OR colocate under `src/lib/__tests__/` if actions tests folder pattern is awkward; pick one and stay consistent
- Minimal type tweaks only if required by omitted `session_settings` on ratee path

**Out of scope**:
- Prompt copy / ACA vs EPB product redesign
- Plan 018 file split (unless a tiny extract is required for #5 — prefer draft state in dialog parent)
- Migrations / RLS policy rewrites (application-layer omit is enough for this plan; do not invent a new migration unless STOP)
- Committing / pushing
- `useEffect` introductions
- Fixing unrelated React Doctor locale warning in `supervisor-feedback-panel.tsx` (optional: if you touch that file for date formatting only with explicit locale — prefer leave alone)

## Steps

### Step 1 — Strip `session_settings` from ratee shared reads (finding 1)

1. In `getMyReceivedFeedbacks`, replace `select(\`*, …\`)` with an **explicit column list** that includes everything the ratee UI needs (`id`, `supervisor_id`, `subordinate_id`, `team_member_id`, `feedback_type`, `cycle_year`, `content`, `status`, `shared_at`, `created_at`, `updated_at`, reviewed ids if used) and **excludes** `session_settings`.
2. When mapping results, set `session_settings: ""` (or omit and satisfy type with empty string) so clients never see private checklist text.
3. In `getFeedback`, if the authenticated user is **not** the row’s `supervisor_id`, also force `session_settings` to `""` before return (defense in depth even if only supervisors call it today).
4. Add a unit/characterization test that mocks supabase return with non-empty `session_settings` and asserts `getMyReceivedFeedbacks` yields empty settings. Follow existing vitest mock style in the repo (search for `createClient` mocks under `src/**/__tests__`).

**Verify**: new test passes; `tsc` clean for touched files.

### Step 2 — Fix client remigration (finding 2) + initial pane (finding 2/5 related)

1. Tighten remigration heuristics in `session-guide-phase-editor.tsx`:
   - Only treat content as legacy checklist when `session_settings` is empty **and** content matches **checklist-only** markers used by SQL/settings templates (e.g. `"Form-prep settings only"` and/or `"Tentative rating focus (evidence comes from Generate)"` / `"Closeout focus (from EPB themes via Generate)"`), **not** generic `"Session Guide"` or `"Knowing your Airman"` alone (generated guides include those).
2. If content looks like a generated outline (e.g. contains `"Tentative rating focus:"` with Strengths/Weaknesses bullets, or `"PRIMARY SOURCE"`, or non-empty content without form-prep markers), keep it in `content` and do **not** clear it.
3. Initialize `activePane` from **local** post-migration state: `"guide"` only when local guide `content` is non-empty; otherwise `"settings"`.

**Verify**: mental cases — (a) empty settings + old checklist → migrates to settings; (b) empty settings + generated guide with “Knowing your Airman” → stays in content; (c) both saved → no remigration.

### Step 3 — `billableFetch` for Generate/Revise (finding 3)

1. Import `billableFetch` from `@/lib/fetch-with-retry`.
2. Replace plain `fetch("/api/revise-feedback-session-guide"…)` and `fetch("/api/generate-feedback-session-guide"…)` with `billableFetch` (same method/headers/body).
3. Keep existing request-id cancellation logic.

**Verify**: `rg "fetch\\(\"/api/(generate|revise)-feedback-session-guide"` in the editor file returns no matches; `billableFetch` is used instead.

### Step 4 — Sequence dialog loads (finding 4)

1. In `expectations-feedback-dialog.tsx`, add generation counters (refs or state) for feedbacks load, evidence load, and EPB load.
2. At start of each async loader, increment; before applying results, ignore if generation !== current.
3. Do **not** introduce `useEffect`.

**Verify**: typecheck; loaders still set loading flags correctly.

### Step 5 — Preserve unsaved drafts across step changes (finding 5)

1. Lift or cache per-`FeedbackType` drafts in the dialog parent: at minimum `{ sessionSettings, content }` for midterm/final and `content` for initial.
2. Before `selectStep` changes `activeStep`, if the current editor reports dirty unsaved changes, either:
   - **Preferred**: persist drafts into a parent `Record<FeedbackType, Draft>` so remount restores them, **or**
   - Confirm discard via existing `AlertDialog` pattern.
3. Prefer draft cache (better UX) without forcing Save.
4. Pass `initialSessionSettings` / `initialContent` overrides into `SessionGuidePhaseEditor` if needed, or change the `key` so it does not wipe cached drafts (e.g. key by feedback id + step but rehydrate from cache).

**Verify**: switching Midterm → Final → Midterm keeps unsaved generated text (manual reasoning + code path review); no `useEffect`.

### Step 6 — EPB loader error vs empty (finding 6)

1. Change `loadFeedbackEpbStatements` to return a result object, e.g. `{ statements: EpbStatementSummary[] | null; error: NextResponse | null }` **or** `{ statements: …; errorMessage: string | null }` matching the accomplishments loader style in the same file.
2. Update `generate-feedback-session-guide/route.ts` Final branch:
   - DB/access errors → 500 (or the same status accomplishments use) with a load-failure message
   - Successful empty → 400 “Add EPB statements…”
3. Update any other callers of `loadFeedbackEpbStatements`.

**Verify**: unit test on loader distinguishing error vs empty (mock supabase); route uses the new shape.

### Step 7 — Route/access characterization tests (finding 7)

Add focused tests (mock supabase / auth as existing API tests do — search `src/app/api/**/__tests__` or similar):

1. Generate midterm without accomplishments → 400
2. Generate final without EPB → 400
3. Generate unauthenticated → 401 (if pattern exists)
4. `verifyFeedbackRateeAccess` or loader access denial path if easily unit-tested
5. Keep tests deterministic; no real network

If full route tests are too heavy for the repo’s patterns, minimum acceptable bar:
- loader tests for EPB error vs empty
- `getMyReceivedFeedbacks` settings strip test
- generate prompt tests already exist — add one assertion that Final prompt forbids accomplishments grounding (already present; keep green)

**Verify**: vitest command in the table passes.

### Step 8 — Final verification

1. `npx tsc --noEmit`
2. Vitest suite listed above
3. `npx react-doctor@latest --verbose --scope changed` — no new errors in touched UI
4. Confirm no `useEffect` added under `src/components/team/session-guide-phase-editor.tsx` or `expectations-feedback-dialog.tsx`

## Done criteria

- [ ] Ratee `getMyReceivedFeedbacks` never returns non-empty `session_settings`
- [ ] Remigration cannot steal a generated guide that merely contains “Knowing your Airman”
- [ ] Generate + Revise use `billableFetch`
- [ ] Stale dialog loads ignored via generation tokens
- [ ] Unsaved drafts survive step switches (cache or confirm)
- [ ] Final Generate distinguishes EPB load failure vs empty package
- [ ] New tests cover settings strip + EPB loader error/empty (+ route cases if feasible)
- [ ] `tsc` clean; vitest green; React Doctor no new errors; no `useEffect`

## STOP conditions

- Required files missing from workspace
- No existing vitest mock pattern for supabase server client and inventing a brittle harness would take >2 hours — implement Step 1 strip + Steps 2–6, add the lightest possible tests, and report TEST GAP clearly
- Types for `SupervisorFeedback.session_settings` force a migration — do not migrate; keep field optional/empty string for ratee DTOs

## Report format

```
STATUS: COMPLETE | STOPPED
STEPS: per step — done/skipped + verification
STOPPED BECAUSE: …
FILES CHANGED: list
NOTES: …
```
