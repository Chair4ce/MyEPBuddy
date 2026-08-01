# Plan 012: Route EPB/Fuse generate through `billableFetch` (stable Idempotency-Key)

> **Executor instructions**: Follow step by step. Verify each step. On STOP, report — do not improvise. Update `advisor-plans/README.md` when done.
>
> **Drift check**: `git diff --stat 71a367e..HEAD -- src/components/epb/epb-shell-form.tsx src/components/entries/fuse-to-epb-dialog.tsx src/lib/fetch-with-retry.ts src/lib/billing/idempotency.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

`/generate` custom-context workspace uses `billableFetch`, which attaches a stable `Idempotency-Key` and syncs the credit counter from response headers. EPB shell generate and Entries Fuse still use raw `fetch("/api/generate")`. On timeout/retry/double-submit the server mints a **new** key (`idempotency.ts` when header missing) and can debit a second credit for one user click — violating “one click = one token.”

## Current state

- Safe exemplar — `src/components/generate/custom-context-workspace.tsx` imports `billableFetch` and posts to `/api/generate`.
- Broken call sites:
  - `src/components/epb/epb-shell-form.tsx` ~1614: `const response = await fetch("/api/generate", { ... })`
  - `src/components/entries/fuse-to-epb-dialog.tsx` ~387: same raw fetch
- Helper: `src/lib/fetch-with-retry.ts` exports `billableFetch(url, init)` which calls `withBillableIdempotencyKey` + `syncCreditsFromResponse`.
- Also check `epb-shell-form` for other billable raw fetches (e.g. `/api/adapt-sentence`, revise) — fix **all** billable POSTs in these two files the same way.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Grep | `rg -n 'fetch\\("/api/generate"' src/components/epb src/components/entries` | no matches (or only non-billable) |

## Scope

**In scope**:
- `src/components/epb/epb-shell-form.tsx`
- `src/components/entries/fuse-to-epb-dialog.tsx`
- Optionally other billable `fetch("/api/...")` in those same files (`revise-selection`, `adapt-sentence`, etc.)

**Out of scope**:
- Changing server `checkAndTrackUsage` / versionCount billing
- Award/decoration generate clients
- Optimistic consume heuristics in `credits-store` (unless required for compile)
- `mpa-section-card.tsx` split view / sentence DnD (sacred — only change `epb-shell-form` fetch sites; do not open the card for drive-by edits)

## Steps

### Step 1: Switch EPB generate to `billableFetch`

In `epb-shell-form.tsx`:
1. Import `{ billableFetch } from "@/lib/fetch-with-retry"` (or add to existing import).
2. Replace `fetch("/api/generate", …)` with `billableFetch("/api/generate", …)`.
3. Repeat for other billable POSTs in this file that lack the helper (`rg "fetch\\(\"/api/" epb-shell-form.tsx`).

Keep existing `handleUsageLimitResponse` / error handling.

**Verify**: `rg -n 'fetch\\("/api/generate"' src/components/epb/epb-shell-form.tsx` → no matches.

### Step 2: Switch Fuse generate to `billableFetch`

Same change in `fuse-to-epb-dialog.tsx`.

**Verify**: `rg -n 'fetch\\("/api/generate"' src/components/entries/fuse-to-epb-dialog.tsx` → no matches.

### Step 3: Typecheck

`npx tsc --noEmit -p tsconfig.json` → exit 0

## Test plan

- Manual: generate on `/epb` once → balance drops by 1; hard-refresh shows same.
- Manual: with network throttling, ensure retry does not drop an extra credit (idempotency header stable for the in-flight request — `billableFetch` already does this).
- No new unit test required if `idempotency` / `fetch-with-retry` already covered; optional smoke asserting import presence via grep in Done criteria.

## Done criteria

- [ ] No raw `fetch("/api/generate"` in EPB form or Fuse dialog
- [ ] Other billable POSTs in those files use `billableFetch` or `fetchWithRetry`
- [ ] `tsc` clean
- [ ] README 012 → DONE

## STOP conditions

- `billableFetch` optimistic consume double-decrements with an existing local optimistic path in EPB — STOP and report; may need to skip optimistic for that call.
- Call site builds Request without JSON body / uses FormData — verify helper still applies headers.

## Maintenance notes

- Any new EPB/Entries AI button must use `billableFetch`, not raw `fetch`.
- Plan 018 adds contract tests that assume client sends idempotency keys.
