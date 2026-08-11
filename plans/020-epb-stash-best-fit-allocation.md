# Plan 020: Allocate stashed EPB leftovers by best MPA fit, not ACA key order

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bb577bd..HEAD -- src/lib/assign-epb-sentences.ts src/lib/__tests__/assign-epb-sentences.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (landed on `cursor/epb-smart-mpa-assignment-21bc` / PR #17)
- **Category**: bug
- **Planned at**: commit `bb577bd`, 2026-08-11

## Why this matters

Pass 2/3 cross-fill walks `ACA_PORTFOLIO_MPA_KEYS` in fixed order (Executing the Mission first). A leftover that scores 45% EM / 90% Improving the Unit is claimed by EM before IU can see it, so later MPAs stay empty or weak. Users with EM-heavy cycles get worse balance than the score data allows.

## Current state

- `src/lib/assign-epb-sentences.ts` — home claims + stash/pop assignment
- Pass 2 currently:

```typescript
for (const mpaKey of ACA_PORTFOLIO_MPA_KEYS) {
  const current = byMpa.get(mpaKey) ?? [];
  const need = PLAN_MAX_SENTENCES_PER_MPA - current.length;
  if (need <= 0) continue;
  takeFromStash(mpaKey, need, MIN_CROSS_FILL_RELEVANCY);
}
```

- Order source: `src/lib/cycle-portfolio.ts` `ACA_PORTFOLIO_MPA_KEYS` = EM → LP → MR → IU
- Tests live in `src/lib/__tests__/assign-epb-sentences.test.ts` (follow that file’s `record()` / `rel()` helpers)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm run test -- src/lib/__tests__/assign-epb-sentences.test.ts` | all pass |
| Lint    | `npx eslint src/lib/assign-epb-sentences.ts` | 0 errors |

## Steps

1. **Add a characterization test** that fails on greedy order: one leftover with EM=45 / IU=90, EM already has 2 home sentences, IU has 0. Expect IU to receive the leftover, not EM.
2. **Replace Pass 2/3 greedy loops** with a best-fit allocator, e.g.:
   - Build open slots: each MPA with `need = 2 - sentences.length` slots
   - For each stash record, score every open MPA (`relevancyForMpa`)
   - Repeatedly assign the (record, mpa) pair with the highest score ≥ active floor, clustering same-verb fills into the same sentence group when the MPA still needs that slot
   - Run once at `MIN_CROSS_FILL_RELEVANCY`, then again at `MIN_DESPERATE_CROSS_FILL_RELEVANCY` for remaining needs
3. Keep home-claim Pass 1 unchanged (tagged MPA only).
4. Keep “each id used at most once” invariant (already tested).
5. Run the test command above; add 1–2 more cases for ties (prefer scarcer MPA / higher overallScore).

## Done criteria

- [ ] New test proves IU (or LP) wins a leftover that scores higher there than on EM
- [ ] `npm run test -- src/lib/__tests__/assign-epb-sentences.test.ts` passes
- [ ] No change to `/api/generate` or dialog UI in this plan

## STOP conditions

- If product owners insist fixed ACA narrative order must win over scores — STOP and report; do not silently reintroduce greedy EM-first.
- If clustering-by-verb during multi-slot fill becomes ambiguous across MPAs — keep one-record-per-pop first, then layer clustering.

## Out of scope

- Soft-home / mis-tag reassignment (plan 021)
- Unassessed synthetic scores (plan 022)
- Deleting unused LLM plan helpers (plan 023)

## Maintenance

Any future change to `ACA_PORTFOLIO_MPA_KEYS` order must not reintroduce priority bias in cross-fill.
