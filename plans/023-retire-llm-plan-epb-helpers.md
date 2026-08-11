# Plan 023: Retire unused LLM *chunk/merge* helpers (keep ARI grouping prompt)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e94007a..HEAD -- src/lib/plan-epb.ts src/lib/plan-epb-prompt.ts src/app/api/plan-epb/route.ts src/lib/__tests__/plan-epb.test.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (only after PR #17 merge confidence)
- **Category**: tech-debt
- **Planned at**: commit `e94007a`, 2026-08-11

## Why this matters

Planning is hybrid again: score pools + **LLM ARI grouping** via `buildGroupEpbPrompt`. Old multi-chunk helpers (`chunkForPlanning`, `mergeChunkPlans`, `trimMergedPlan`) may still be unused. Do **not** delete `buildGroupEpbPrompt` / `sanitizePlan` / allocation helpers.

## Current state

- Live route: `allocateEpbCandidatePools` → `buildGroupEpbPrompt` → `sanitizePlan` / `constrainPlanToPools`
- Possibly dead: `chunkForPlanning`, `mergeChunkPlans`, `trimMergedPlan` if no callers outside tests
- **Keep**: `buildGroupEpbPrompt`, `sanitizePlan`, `toPlanRecords`, `assign-epb-sentences` allocation

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Grep    | `rg "chunkForPlanning|mergeChunkPlans|trimMergedPlan|buildPlanEpbPrompt|buildGroupEpbPrompt" src` | group prompt + sanitize used by route; chunk/merge only if still needed |
| Tests   | `npm run test -- src/lib/__tests__/plan-epb.test.ts src/lib/__tests__/assign-epb-sentences.test.ts` | all pass |

## Steps

1. `rg` each helper. Delete only unused chunk/merge/trim if production has zero callers.
2. Keep `buildGroupEpbPrompt` and its verb-matching prohibition + USO cumulative example.
3. Slim tests accordingly; do not remove ARI grouping coverage.
4. Confirm `/api/plan-epb` remains in `BILLABLE_API_PATHS` (grouping uses LLM).

## Done criteria

- [ ] No deletion of ARI grouping prompt or allocation module
- [ ] Dead chunk/merge path removed or documented as kept
- [ ] Tests green

## STOP conditions

- If `buildGroupEpbPrompt` appears unused — STOP and report (regression); do not "clean up" by deleting it.
- Do not reintroduce verb-string clustering.

## Out of scope

- Changing allocation thresholds or grouping prompt semantics
