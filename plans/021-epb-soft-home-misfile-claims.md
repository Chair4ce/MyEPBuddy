# Plan 021: Soft-home claims when tagged MPA fit is clearly wrong

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat bb577bd..HEAD -- src/lib/assign-epb-sentences.ts src/lib/cycle-portfolio.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/020-epb-stash-best-fit-allocation.md (soft; can parallelize if tests stay isolated)
- **Category**: direction
- **Planned at**: commit `bb577bd`, 2026-08-11

## Why this matters

Pass 1 hard-claims every tagged entry for its home MPA even when `mpa_relevancy` says it belongs elsewhere (e.g. tagged Executing the Mission at 15%, Leading People at 95%). That burns a sentence slot on weak home fit and starves the true MPA. Portfolio already has a misfile gap constant for this signal.

## Current state

- Home filter in `assignEpbSentenceGroups`:

```typescript
const home = usable.filter(
  (r) => r.taggedMpa === mpaKey && !used.has(r.id)
);
```

- Misfile gap: `PORTFOLIO_MISFILE_GAP` in `src/lib/cycle-portfolio.ts` (primary relevancy exceeds tagged by ≥20)
- Records already carry `primaryMpa` + `mpaRelevancy` via `toPlanRecord`

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm run test -- src/lib/__tests__/assign-epb-sentences.test.ts` | all pass |

## Steps

1. Add test: EM-tagged record with EM=15 / LP=95 and a weak LP-tagged record → after assignment, the strong record should land under Leading People (or stash for LP), not occupy an EM sentence when EM has better true-home options.
2. Before Pass 1 claims, mark “misfiled” records: `relevancy(primary) - relevancy(tagged) >= PORTFOLIO_MISFILE_GAP` (import the shared constant — do not invent a new gap).
3. Misfiled records skip hard home claim and enter the stash (or soft-home to `primaryMpa` if that MPA still needs slots). Prefer stash + best-fit (020) if 020 has landed.
4. Surface rationale text so review UI explains “reassigned from tagged X (fit Y%)”.
5. Do **not** change user-visible tags on the accomplishment row — only planning assignment.

## Done criteria

- [ ] Misfiled high-LP entry is not locked into a weak EM sentence when LP needs it
- [ ] Uses `PORTFOLIO_MISFILE_GAP`, not a one-off number
- [ ] Assignment tests cover misfile + non-misfile controls

## STOP conditions

- If product decides tagged MPA must always win regardless of scores — STOP; document as rejected.
- Do not rewrite `assessment_scores` or DB `mpa` columns.

## Out of scope

- UI to retag accomplishments
- Changing assessment prompt thresholds
