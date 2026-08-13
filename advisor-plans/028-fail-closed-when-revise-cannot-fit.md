# Plan 028: Fail closed when revise cannot fit the cap without truncating

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat origin/acceptance..HEAD -- src/app/api/revise-selection/route.ts src/lib/statement-char-enforce.ts src/components/epb/epb-shell-form.tsx`
> If those files drifted, re-read the live fallback before editing.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (this branch already removed clause-trim)
- **Category**: bug
- **Planned at**: branch `cursor/epb-revise-keep-two-sentences-43d2`

## Why this matters

Clause-boundary trim is gone on purpose: a chopped EPB sentence is worse than an over-limit one. When LLM compress still cannot land ≤ max, `/api/revise-selection` **drops** fitting versions, then if **none** fit it **returns the uncompressed drafts anyway** (see the `fitting.length > 0` else-branch). The user can still get 452/350 complete sentences with no error. Generate logs `STILL OVER` and also returns the over-limit package to the UI.

The product rule is: complete sentences **and** ≤ field max. If the model cannot do both, the API should fail closed (error the client can retry), not silently offer over-limit text.

## Current state

- `src/lib/statement-char-enforce.ts` — `enforcePackageCharacterLimit` compresses with abbreviations + LLM only. `stillOver: true` when still over. No `trimToMaxAtClauseBoundary`.
- `src/app/api/revise-selection/route.ts` — after enforce, drops still-over / collapsed two-sentence revisions; if the filtered list is empty, logs a warning and keeps the raw drafts.
- `src/app/api/generate/route.ts` — same enforcer; `stillOver` is only `console.warn`.
- Client: `src/components/epb/epb-shell-form.tsx` uses `result.revisions || []` with no `stillOver` / error field.

Do **not** restore truncation. Do **not** edit `src/components/epb/mpa-section-card.tsx` (split view / sentence DnD are sacred).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test -- src/lib/__tests__/statement-char-enforce.test.ts src/lib/__tests__/revise-length-constraint.test.ts` | pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Steps

1. Add a structured flag on the revise JSON response when every version is still over or was dropped, e.g. `{ revisions, original, capFitFailed: true }` — **or** return HTTP 422 with a safe message like "Could not rewrite within the character limit. Try Revise again." Prefer 422 so the existing error toast path fires; only use a flag if the client already swallows non-2xx poorly — check `epb-shell-form.tsx` revise fetch error handling first.
2. Do **not** return over-limit drafts as `revisions` in that failure case. Empty `revisions` plus an error is correct.
3. Add a unit test for the filter logic if you extract it (e.g. `pickRevisionsThatFitCap(revisions, max, expectedSentenceCount)`). Do not add a live LLM test.
4. Optional same-pass: if generate `stillOver`, omit that version from the version list or mark it unusable — only if the generate UI already skips empty versions safely. If unclear, STOP and leave generate as warn-only; do not guess.

## Done criteria

- No path in `statement-char-enforce.ts` truncates text to force `length <= max`.
- Revise never returns a revision that is over `selectionMax` when enforce ran.
- When none fit, the client shows an error, not 452/350 text.
- Tests above pass. `mpa-section-card.tsx` untouched.

## STOP conditions

- Restoring `trimToMaxAtClauseBoundary` as a last resort.
- Changing split-view / sentence DnD.
- Charging extra credits for a retry loop beyond the existing 3 compress attempts.
