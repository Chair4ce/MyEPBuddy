# Plan 012: Characterization tests for parseTalkingPointsDraft and summary selection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/lib/feedback-talking-points.ts src/lib/__tests__/feedback-talking-points.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

Billable talking-points success depends on `parseTalkingPointsDraft` and on which accomplishments `buildAccomplishmentsSummary` selects. Today `feedback-talking-points.test.ts` covers format/truncate/prompt helpers but **not** parse or summary selection — regressions become silent 500s or weak drafts.

## Current state

- Parser — `src/lib/feedback-talking-points.ts` `parseTalkingPointsDraft` (~406+): extracts JSON via `/\{[\s\S]*\}/`, requires `headline`, filters sections/bullets/asks/refs, forces `feedbackType` from argument.
- Summary — `buildAccomplishmentsSummary` (~125+): top per MPA, lowest scored, unassessed counts; uses `FULL_DETAIL_ENTRY_THRESHOLD`.
- Tests — `src/lib/__tests__/feedback-talking-points.test.ts`: has `makeEntry` / `makeScores` helpers; imports omit `parseTalkingPointsDraft` and may lightly touch summary — **add** dedicated cases. Model structure after existing `describe` blocks in that file.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` | all pass |

## Scope

**In scope**:
- `src/lib/__tests__/feedback-talking-points.test.ts`

**Out of scope**:
- Changing parser/summary production behavior (unless a test reveals a clear bug — then STOP and report; do not “fix while testing”)
- Route integration tests

## Git workflow

- Commit message example: `Add parse and summary tests for feedback talking points`
- Do NOT push.

## Steps

### Step 1: Import symbols

Add imports for `parseTalkingPointsDraft` and `buildAccomplishmentsSummary` (if not already imported).

### Step 2: parseTalkingPointsDraft cases

Add `describe("parseTalkingPointsDraft", …)` covering at least:

1. Happy path: fenced or plain JSON with headline, sections, suggestedAsks, evidenceRefs → typed draft; `feedbackType` equals the argument even if JSON says otherwise.
2. Strips non-string bullets / empty junk.
3. Throws when no JSON object present.
4. Throws when headline missing/empty.

**Verify**: tests fail before implementation only if imports wrong — they should pass against current code.

### Step 3: buildAccomplishmentsSummary cases

Add cases covering:

1. With assessed entries across MPAs: `topByMpa` includes highest overall_score per MPA (at least one assertion with two EM entries, higher score wins).
2. `lowestScored` includes a clearly low-scoring assessed entry when enough data exists.
3. Unassessed entries increment `unassessedCount` and do not appear as top assessed lines.
4. `reviewedAccomplishmentIds` includes ids that were selected for the summary (assert non-empty when assessed entries provided).

Reuse `makeEntry` / `makeScores` / `buildCyclePortfolio` patterns already in the file.

**Verify**: `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` → all pass

## Test plan

Covered by Steps 2–3. Prefer ≥6 new `it(...)` blocks.

## Done criteria

- [ ] Parse happy path + throw paths tested
- [ ] Summary selection (top / unassessed / reviewed ids) tested
- [ ] `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` exits 0
- [ ] No production file changes
- [ ] Only in-scope files modified

## STOP conditions

- Parser API differs from excerpts (signature/fields renamed).
- A test can only pass by changing production code — STOP; report the mismatch.

## Maintenance notes

- If JSON schema for talking points expands, extend these tests first.
- Reviewers: ensure tests assert behavior, not just “does not throw”.
