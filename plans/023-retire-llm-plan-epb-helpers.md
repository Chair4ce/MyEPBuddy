# Plan 023: Retire unused LLM plan-epb helpers after deterministic assignment

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat bb577bd..HEAD -- src/lib/plan-epb.ts src/lib/plan-epb-prompt.ts src/app/api/plan-epb/route.ts src/lib/__tests__/plan-epb.test.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (only after PR #17 merge confidence)
- **Category**: tech-debt
- **Planned at**: commit `bb577bd`, 2026-08-11

## Why this matters

`/api/plan-epb` is now score-only (`assignEpbSentenceGroups`). Chunking, merge/trim, sanitize-from-LLM-JSON, and `buildPlanEpbPrompt` remain tested dead code. Keeping them invites accidental reintroduction of billed LLM planning.

## Current state

- Live route: `src/app/api/plan-epb/route.ts` calls `assignEpbSentenceGroups` only
- Still present: `chunkForPlanning`, `mergeChunkPlans`, `sanitizePlan`, `trimMergedPlan` in `plan-epb.ts`; full `plan-epb-prompt.ts`; tests in `plan-epb.test.ts`
- Still needed: `toPlanRecord(s)`, `EpbPlan` types, `PLAN_MAX_SENTENCES_PER_MPA`, `sanitizePlan` only if any other caller remains

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Grep    | `rg "buildPlanEpbPrompt|chunkForPlanning|mergeChunkPlans|trimMergedPlan|sanitizePlan" src` | only tests / files you intentionally keep |
| Tests   | `npm run test -- src/lib/__tests__/plan-epb.test.ts src/lib/__tests__/assign-epb-sentences.test.ts` | all pass |

## Steps

1. `rg` for each helper; if unused outside tests, delete `plan-epb-prompt.ts` and unused exports from `plan-epb.ts`.
2. Slim `plan-epb.test.ts` to `toPlanRecord` / types still in use (or delete obsolete cases).
3. Keep `sanitizePlan` **only** if another route still needs it; otherwise delete.
4. Confirm `/api/plan-epb` and `assign-epb-sentences` imports still typecheck.

## Done criteria

- [ ] No dead LLM prompt module left unless a caller exists
- [ ] Tests updated; suite green
- [ ] BILLABLE path for `/api/plan-epb` remains absent (`src/lib/billable-api.ts`)

## STOP conditions

- If a non-test production caller of `buildPlanEpbPrompt` appears — STOP and report; do not delete.
- Do not remove `assignEpbSentenceGroups` or `toPlanRecords`.

## Out of scope

- Changing assignment algorithm behavior
- Billing system refactors beyond confirming plan-epb stays non-billable
