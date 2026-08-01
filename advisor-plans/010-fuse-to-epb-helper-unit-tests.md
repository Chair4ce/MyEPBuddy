# Plan 010: Unit-test Fuse-to-EPB majority MPA + accomplishment payload shaping

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/components/entries/fuse-to-epb-dialog.tsx`
> If `majorityMpa` was moved or renamed, update this plan’s import paths before coding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e1e258b`, 2026-07-31
- **Status note**: Partially landed in-session — `src/lib/fuse-to-epb.ts` + `src/lib/__tests__/fuse-to-epb.test.ts` cover substantial-statement detection and S1/S2 merge. `majorityMpa` / generate payload helpers still live in the dialog if an executor wants to finish this plan.

## Why this matters

`majorityMpa` and the generate payload’s `impact: composeImpactString(...) || a.impact` live only inside the dialog today. Wrong default MPA or dropped stewardship impact is silent and burns tokens. Cheap unit tests lock the contract without a Playwright harness.

## Current state

- `majorityMpa` is a private function at the top of `src/components/entries/fuse-to-epb-dialog.tsx`
- Payload shaping is inline in `handleGenerate` (`accPayload` map)
- Exemplar test style: `src/lib/__tests__/stewardship-impact.test.ts`, `src/lib/__tests__/impact-booster.test.ts` (vitest `describe`/`it`)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npx vitest run src/lib/__tests__/fuse-to-epb.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## In scope

- Extract pure helpers to `src/lib/fuse-to-epb.ts` (or similar):
  - `majorityMpa(entries: { mpa: string }[]): string` — prefer `ENTRY_MGAS` keys; fallback `executing_mission`
  - `toGenerateAccomplishmentPayload(a: Accomplishment)` — stewardship compose + metrics
- `src/lib/__tests__/fuse-to-epb.test.ts` covering:
  - empty → fallback
  - tie → first-seen / stable winner (document chosen rule in test name)
  - unknown MPA → fallback
  - stewardship present → `impact` uses composed string
  - stewardship empty → legacy `impact`
- Update dialog to import helpers (no behavior change)

## Out of scope

- Dialog React testing / Playwright
- Mocking `/api/generate`
- Shell create tests (covered conceptually by plan 009)

## Steps

1. Extract helpers without changing behavior; dialog imports them.
2. Write tests matching stewardship-impact style.
3. Run vitest + tsc.

## Done when

- [ ] Helpers exported from `src/lib`
- [ ] Dialog uses them (no local duplicate `majorityMpa`)
- [ ] Vitest file green
- [ ] `npx tsc --noEmit` exits 0

## STOP conditions

- Project does not use vitest for `src/lib/__tests__` — STOP and report the actual test runner from `package.json`

## Maintenance

If ENTRY_MGAS keys change, update fallback expectations in the majority-MPA tests.
