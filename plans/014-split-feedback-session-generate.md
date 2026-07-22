# Plan 014: Extract feedback-session generate flow out of the giant dialog inner

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/components/team/feedback-session-dialog.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 011 (toast for truncated warning lives near generate — do 011 first)
- **Category**: tech-debt
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

React Doctor flags `FeedbackSessionDialogInner` as a giant component (~600+ lines of logic in a ~724-line file). Generate/save/share/print live together, making race fixes and reviews hard. Extracting the generate path reduces file size and isolates billable-fetch + request-id invalidation.

**Hard constraint (repo rule):** Do **not** add any new `useEffect`. Prefer a plain async function module + optional custom hook that only uses `useState`/`useRef`/`useTransition` if needed — no effects.

## Current state

- File: `src/components/team/feedback-session-dialog.tsx`
- Outer `FeedbackSessionDialog` (~96) wraps `FeedbackSessionDialogInner` (~122).
- Generate: `handleGenerateClick` (~325), `executeGenerate` (~338) with `generateRequestIdRef`, expectations prefetch for Initial, `fetch("/api/generate-feedback-talking-points")`, sets content + `reviewedAccomplishmentIdsRef`.
- May include `accomplishments_truncated` toast from plan 011 — move with generate.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Doctor (optional) | `npm run doctor -- --verbose --scope changed` | score ≥ prior; giant-component warning for Inner reduced or gone |

## Scope

**In scope**:
- `src/components/team/feedback-session-dialog.tsx`
- **Create** one of:
  - `src/components/team/feedback-session-generate.ts` (pure helpers: labels, aria, request body builder, response applicator), and/or
  - `src/components/team/use-feedback-talking-points-generate.ts` (state + `executeGenerate` / click handler) — **no useEffect**

**Out of scope**:
- Redesigning dialog UX / share-confirm flows
- Splitting save/share/delete (optional follow-up; do not expand unless Inner still >400 lines after generate extract — then extract print helpers only)
- Adding `useEffect` anywhere

## Git workflow

- Commit message example: `Extract feedback talking-points generate flow from session dialog`
- Do NOT push.

## Steps

### Step 1: Extract pure helpers

Move to `feedback-session-generate.ts` (or similar):
- `GENERATE_BUTTON_LABELS`, `GENERATE_HELPER_TEXT`, `getGenerateAriaLabel`
- Optional: `buildTalkingPointsRequestBody({ feedbackType, subordinateId, teamMemberId, cycleYear })`
- Optional: `escapeHtml` if only used by print — only move if it clarifies; print can stay.

**Verify**: dialog imports helpers; behavior unchanged.

### Step 2: Extract generate orchestration

Create `useFeedbackTalkingPointsGenerate` (name flexible) returning:
- `isGenerating`, `handleGenerateClick`, `executeGenerate` (or single `generate()`), and whatever refs the dialog needs for `reviewedAccomplishmentIds` after success.

Keep race guard (`requestId` / ref invalidation) identical to current logic.

Move truncated-accomplishments toast handling with this hook/module.

Wire Inner to use the hook/helpers. Target: `FeedbackSessionDialogInner` function body meaningfully smaller (aim Inner file total ≤ ~500 lines, or Inner function clearly under Doctor’s 300-line threshold if Doctor counts the function).

**Verify**: `rg -n "generate-feedback-talking-points" src/components/team/` still finds the fetch; `npx tsc --noEmit` → 0

### Step 3: No new effects

**Verify**: `rg -n "useEffect" src/components/team/use-feedback-talking-points-generate.ts src/components/team/feedback-session-generate.ts` → no matches (files may not both exist).

### Step 4: Optional React Doctor

If `npm run doctor` exists, run `--verbose --scope changed` and note score in commit notes / report.

## Test plan

- No new component test required unless a pure helper is trivially unit-testable (optional).
- Manual: typecheck is the gate; preserve generate race invalidation code paths by copying carefully.

## Done criteria

- [ ] Generate fetch + race guard live outside the monolith (hook and/or helpers file)
- [ ] Zero new `useEffect`
- [ ] Dialog still exports `FeedbackSessionDialog` with same props
- [ ] `npx tsc --noEmit` exits 0
- [ ] Only in-scope files modified

## STOP conditions

- Extract requires adding `useEffect` to satisfy the plan — STOP; redesign without effects.
- Plan 011 not present and warnings toast location unclear — implement generate extract without toast; leave a NOTE.

## Maintenance notes

- Reviewers: compare `executeGenerate` before/after for request-id races and Initial expectations prefetch.
- Follow-up: extract print/export HTML builder similarly.
