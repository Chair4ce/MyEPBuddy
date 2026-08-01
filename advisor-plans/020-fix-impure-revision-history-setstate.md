# Plan 020: Remove side effects from revision-history `setState` updater

> **Drift check**: `git diff --stat 71a367e..HEAD -- src/components/epb/mpa-section-card.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

React may re-run state updaters (Strict Mode / concurrent). Calling `setActiveRevisionIndex` inside `setRevisionHistory(prev => …)` can double-fire and point the revision carousel at the wrong batch. React Doctor flags this as “State updater has side effects.”

## Current state

`src/components/epb/mpa-section-card.tsx` ~1114-1118 (approx — re-find with):

`rg -n "setRevisionHistory" -A6 src/components/epb/mpa-section-card.tsx`

Pattern today:

```ts
setRevisionHistory((prev) => {
  const next = [...prev, batch].slice(-MAX_REVISION_HISTORY);
  setActiveRevisionIndex(next.length - 1); // impure
  return next;
});
```

Also scan `duty-description-card.tsx` for the same anti-pattern.

## Scope

**In scope**: Only the revision-history `setState` purity fix in `mpa-section-card.tsx` / `duty-description-card.tsx` if duplicated  

**Out of scope**: Broader revision-history refactors; React Doctor score chase; **EPB MPA split view**; **sentence drag-and-drop** (sensors, overlays, reorder handlers, split layout). Touch nothing in those subtrees — see sacred-surfaces lock in `advisor-plans/README.md`.

## Steps

1. Compute `next` in the event handler.
2. `setRevisionHistory(next)` then `setActiveRevisionIndex(next.length - 1)` — or single state object `{ batches, activeIndex }`.
3. Do **not** add `useEffect` to sync index (repo forbids new useEffects).

**Verify**: `rg -n "setActiveRevisionIndex" -B5 src/components/epb/mpa-section-card.tsx` — not nested inside another setState callback.

## Done criteria

- [ ] No setState-inside-setState for revision history
- [ ] `tsc` clean
- [ ] Manual: generate 3 revisions → active index is latest batch
- [ ] README 020 → DONE

## STOP conditions

- React Compiler / existing pattern requires batched updates differently — use one combined state instead of improvising effects.
- Fix appears to require changing split-view or sentence DnD state — STOP and report; do not “simplify” those systems while fixing the updater.
