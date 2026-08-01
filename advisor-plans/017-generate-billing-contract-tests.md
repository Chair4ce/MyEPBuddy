# Plan 017: Lock generate billing contract (`versionCount=3` → 1 consume; empty → refund)

> **Drift check**: `git diff --stat 71a367e..HEAD -- src/app/api/generate/route.ts src/lib/generate-version-count.ts src/lib/billing src/lib/usage-tracker.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: soft — Plan 012 (client idempotency) independent; Plan 013 should land first if both touch usage mocks
- **Category**: tests
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

Generate is the highest-churn money path. Product contract: one credit per request regardless of `versionCount`; empty results refund. Only `clampGenerateVersionCount` is unit-tested today — regressions can double-charge or keep credits on failure.

## Current state

- Charge once: `src/app/api/generate/route.ts` calls `checkAndTrackUsage` once before the version loop.
- Refund empty: `refundAndError` when `results.length === 0` (added with multi-version work).
- Clamp: `src/lib/generate-version-count.ts` + test.
- Exemplar billing tests: `src/lib/billing/__tests__/idempotency-refund.test.ts`, `src/lib/__tests__/usage-tracker.test.ts`.
- Repo has **zero** `src/app/api/**/*.test.ts` — prefer testing extracted helpers / mocking at module boundary rather than inventing full Next route harness unless one already exists.

## Scope

**In scope**:
- New tests under `src/lib/__tests__/` or `src/app/api/generate/__tests__/` if you introduce a thin testable wrapper
- Optional extract of “run versions + decide refund” pure helper **only if** required to test without booting Next — keep extract minimal

**Out of scope**: Changing billing product rules; Playwright e2e.

## Steps

### Step 1: Choose test strategy

Prefer: mock `ai` `generateText`, `checkAndTrackUsage`, `refundBillableCreditIfNeeded` / `refundAndError` and invoke a small exported function OR use route handler with `Request` if the file already exports test seams.

If POST cannot be imported cleanly, extract `shouldRefundEmptyGenerateResults(results)` + document that charge-once is enforced by single call site + integration test of clamp + a new test file that spies call counts on a wrapper.

**STOP** if extraction would exceed ~50 LOC of move — report and keep characterization at usage-tracker + refund helper level with a generate-specific test that imports route and calls POST with mocked modules (vitest `vi.mock`).

### Step 2: Cases

1. `versionCount: 3` → `checkAndTrackUsage` called **once**
2. All versions fail / empty statements → refund path invoked (or `refundAndError` used)
3. Unauthorized → no consume (if easy)
4. Clamp still covered by existing test

**Verify**: `npm test -- generate` (or the new file path) → pass

## Done criteria

- [ ] Test proves single consume for multi-version
- [ ] Test proves empty → refund/error path
- [ ] `tsc` clean
- [ ] README 017 → DONE

## STOP conditions

- Mocking `ai` package breaks other suites — isolate with `vi.mock` in the single file.
- Cannot import route in vitest — stop and propose minimal extract rather than flaky full-app boot.
