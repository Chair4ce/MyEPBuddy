# Plan 015: Unify misfile relevancy gap constant (portfolio + coaching)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/lib/cycle-portfolio.ts src/lib/assessment-coaching.ts src/lib/__tests__/cycle-portfolio.test.ts src/lib/__tests__/assessment-coaching.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

`PORTFOLIO_MISFILE_GAP` (`cycle-portfolio.ts` = 20) and `MISFILE_RELEVANCY_GAP` (`assessment-coaching.ts` = 20) duplicate the same product rule. Drift would make Quality insights disagree with coaching tips.

## Current state

- `src/lib/cycle-portfolio.ts`: `export const PORTFOLIO_MISFILE_GAP = 20;`
- `src/lib/assessment-coaching.ts`: `export const MISFILE_RELEVANCY_GAP = 20;`
- Tests import each constant separately.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test -- src/lib/__tests__/cycle-portfolio.test.ts src/lib/__tests__/assessment-coaching.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/lib/cycle-portfolio.ts`
- `src/lib/assessment-coaching.ts`
- `src/lib/__tests__/assessment-coaching.test.ts` (import path only if needed)
- Optionally `src/lib/__tests__/cycle-portfolio.test.ts` if re-export changes names

**Out of scope**:
- Changing the numeric threshold
- UI copy changes

## Git workflow

- Commit message example: `Share a single misfile relevancy gap constant across portfolio and coaching`
- Do NOT push.

## Steps

### Step 1: Single source of truth

Keep the canonical export on `cycle-portfolio.ts` as `PORTFOLIO_MISFILE_GAP` (already used by portfolio + its tests).

In `assessment-coaching.ts`:
```ts
import { PORTFOLIO_MISFILE_GAP } from "@/lib/cycle-portfolio";

/** @deprecated alias — prefer PORTFOLIO_MISFILE_GAP */
export const MISFILE_RELEVANCY_GAP = PORTFOLIO_MISFILE_GAP;
```

Or drop the alias and update coaching impl + tests to import `PORTFOLIO_MISFILE_GAP` — **preferred** if grep shows few call sites.

Use coaching’s misfile helper with the imported constant (no local `= 20`).

**Verify**: `rg -n "MISFILE_RELEVANCY_GAP\\s*=\\s*20|PORTFOLIO_MISFILE_GAP\\s*=\\s*20" src/lib` shows **exactly one** numeric assignment.

### Step 2: Update tests

Point assessment-coaching tests at the shared constant (either alias or `PORTFOLIO_MISFILE_GAP`).

**Verify**: both test files pass; `npx tsc --noEmit` → 0

## Done criteria

- [ ] Only one numeric `= 20` misfile gap definition in `src/lib`
- [ ] Coaching + portfolio use the same value
- [ ] Related unit tests pass
- [ ] Only in-scope files modified

## STOP conditions

- Circular import between `cycle-portfolio` and `assessment-coaching` — then move the constant to a tiny `src/lib/assessment-thresholds.ts` instead (allowed in-scope addition) and import from both.

## Maintenance notes

- Reviewers: ensure no circular dependency.
- Future threshold tweaks: change one place only.
