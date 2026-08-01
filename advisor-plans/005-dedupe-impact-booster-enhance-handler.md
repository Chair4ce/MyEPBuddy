# Plan 005: Dedupe Impact Booster enhance handler in MPA section card

> **Executor instructions**: Follow step by step. Update status in `advisor-plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- src/components/epb/mpa-section-card.tsx`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit post-Impact-Booster implementation, 2026-07-31

## Why this matters

`MPASectionCard` currently inlines nearly identical `onEnhance` callbacks twice (once inside the generated-results collapse, once for the persisted-only panel). A future bugfix will likely miss one copy.

## Current state

Two `<ImpactBoosterPanel>` instances in [`src/components/epb/mpa-section-card.tsx`](src/components/epb/mpa-section-card.tsx) each pass a large inline `onEnhance` that calls `onGenerateStatement` with the same options shape.

## Scope

**In scope**: `src/components/epb/mpa-section-card.tsx` only — extract one `handleImpactBoosterEnhance(clarifyingContext: string)` function used by both panels.

**Out of scope**: Changing Impact Booster API, persistence, or generate route; **EPB MPA split view** and **sentence drag-and-drop** (sacred — `advisor-plans/README.md`). Extract the enhance handler only; do not refactor layout, DnD, or split chrome.

## Steps

1. Extract shared enhance handler next to `handleGenerate`.
2. Pass `onEnhance={handleImpactBoosterEnhance}` to both panels.
3. **Verify**: `npx eslint src/components/epb/mpa-section-card.tsx` → exit 0 (or only pre-existing warnings).

## Done criteria

- [ ] Single enhance implementation shared by both panels
- [ ] Behavior unchanged (regenerate with clarifyingContext, set generating flag, toast on error)

## STOP conditions

- Panel props diverge such that sharing would change behavior — report instead of forcing a merge.
- Diff would touch split-view or sentence DnD code — STOP; keep the change limited to the enhance-handler extract.
