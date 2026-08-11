# Plan 022: Unassessed cross-fill policy + show empty MPAs in Generate EPB review

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat bb577bd..HEAD -- src/lib/assign-epb-sentences.ts src/lib/generate-epb-run.ts src/lib/epb-generation-readiness.ts src/components/entries/generate-epb-dialog.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `bb577bd`, 2026-08-11

## Why this matters

1. Unassessed leftovers get `relevancyForMpa = 0` for non-home MPAs, so cross-fill never runs — yet readiness warns that empty tagged areas “will try to fill from scores.”
2. Review UI only lists MPAs present in the plan (`Object.keys(editable)`), so an empty area cannot be manually filled in-dialog.

## Current state

```typescript
// assign-epb-sentences.ts — unassessed non-home → 0
return record.taggedMpa === mpaKey ? UNASSESSED_HOME_RELEVANCY : 0;
```

```typescript
// generate-epb-run.ts planToEditable — only planned MPAs
for (const selection of plan.mpas) { ... }
```

Readiness warning already promises cross-fill (`epb-generation-readiness.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm run test -- src/lib/__tests__/assign-epb-sentences.test.ts src/lib/__tests__/generate-epb-run.test.ts src/lib/__tests__/epb-generation-readiness.test.ts` | all pass |
| Doctor  | `npx react-doctor@latest --verbose --scope changed` | no new errors; note score |

## Steps

1. **Policy (pick A, document in code comment)**:
   - **A (recommended)**: unassessed non-home score = `Math.min(UNASSESSED_HOME_RELEVANCY - 15, MIN_DESPERATE_CROSS_FILL_RELEVANCY)` only when *all* stash candidates for an empty MPA are unassessed; otherwise keep 0 so assessed scores win.
   - Or **B**: keep score 0 and change readiness warning to say empty areas need assessments to cross-fill.
2. Implement the chosen policy + tests.
3. Update `planToEditable` (or dialog init) to seed all four `ACA_PORTFOLIO_MPA_KEYS` with `{ enabled: false, groups: [[]] }` when missing so review can enable/add groups.
4. Ensure generate still skips disabled/empty groups (`editableToMpaSelections` already does).

## Done criteria

- [ ] Warning text and assignment behavior agree
- [ ] Review shows all four core MPAs (disabled if empty)
- [ ] Tests cover unassessed cross-fill (or explicit non-fill) and seeded editable keys
- [ ] React Doctor changed-scope has no new error-severity findings

## STOP conditions

- Do not invent LLM calls for unassessed planning.
- Do not use `useEffect` (repo rule).

## Out of scope

- Auto-running assessment before Generate EPB
- Soft-home misfile (021)
