# Plan 010: Reject missing rank and non-enlisted ratees on ACA preview + talking-points APIs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/app/api/generate-feedback-talking-points/route.ts src/app/api/assess-accomplishment-preview/route.ts src/lib/constants.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can run parallel with 009; if both touch talking-points route, serialize after 009)
- **Category**: correctness
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

`getRubricTierForRank(null)` returns `"junior"`, so a managed member with no rank silently gets AF Form 931. Officers also fall through to `"junior"` (not in the senior list, not civilian). UI hides quality/ACA preview behind `isEnlisted`, but **preview** and **talking-points** APIs only reject civilians — billable ACA work can run for officers / unranked ratees with the wrong rubric.

**Do not** change global `getRubricTierForRank` behavior in this plan (too many call sites). Gate at the two new billable surfaces.

## Current state

- `src/lib/constants.ts` (~996–1002):

```ts
export function getRubricTierForRank(rank: Rank | string | null): ACARubricTier | null {
  if (!rank) return "junior";
  if (isCivilian(rank)) return null;
  const seniorRanks = ["MSgt", "SMSgt", "CMSgt"];
  return seniorRanks.includes(rank) ? "senior" : "junior";
}
```

- Talking-points — `generate-feedback-talking-points/route.ts` (~322–334): rejects `isCivilian`, then `if (!getRubricTierForRank(...))` — **null rank never fails** because tier is `"junior"`.
- Preview — `assess-accomplishment-preview/route.ts` (~344–348): rejects civilian only; no `isEnlisted` check. UI uses `isEnlisted` (e.g. `epb-progress-card.tsx`, entries page).
- `isEnlisted` — `src/lib/constants.ts` (~99+): true for enlisted ranks only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/app/api/generate-feedback-talking-points/route.ts`
- `src/app/api/assess-accomplishment-preview/route.ts`

**Out of scope**:
- Changing `getRubricTierForRank` return for null
- `assess-accomplishment` (non-preview) unless you discover it already gates enlisted — do not expand scope
- UI filter changes

## Git workflow

- Commit message example: `Gate ACA preview and talking-points to enlisted ratees with known rank`
- Do NOT push.

## Steps

### Step 1: Talking-points route gates

Import `isEnlisted` from `@/lib/constants` (already imports `getRubricTierForRank`, `isCivilian`).

After `ratee` is resolved and **before** loading accomplishments / billing, add (order matters):

1. If `!ratee.rank` (null/undefined/empty string after trim if you normalize) → `400` `{ error: "Ratee rank is required for ACA feedback talking points" }`
2. Else if `isCivilian(ratee.rank)` → keep existing civilian message
3. Else if `!isEnlisted(ratee.rank as Rank)` → `400` `{ error: "ACA feedback talking points are only available for enlisted ratees" }`
4. Keep existing `getRubricTierForRank` check as a final belt-and-suspenders

**Verify**: `rg -n "isEnlisted|Ratee rank is required" src/app/api/generate-feedback-talking-points/route.ts` shows both.

### Step 2: Preview route gates

Import `isEnlisted` if not already imported.

After `resolvedRateeRank` is available and civilian check:

1. If `resolvedRateeRank` is null/undefined/empty → `400` `{ error: "Ratee rank is required for accomplishment assessment" }`
2. Else if `!isEnlisted(resolvedRateeRank)` (and not already returned for civilian) → `400` `{ error: "Accomplishment assessment is only available for enlisted ratees" }`

Civilian check may stay first (existing). Officers should hit the enlisted message; unranked hit rank-required.

**Verify**: `rg -n "isEnlisted|Ratee rank is required" src/app/api/assess-accomplishment-preview/route.ts` shows gates before `generateText`.

### Step 3: Typecheck

**Verify**: `npx tsc --noEmit` → exit 0

## Test plan

- No new test file required. If a focused unit test for a tiny pure helper is easier, optional — not required.
- Grep gates above.

## Done criteria

- [ ] Talking-points rejects missing rank and non-enlisted (including officers)
- [ ] Preview rejects missing rank and non-enlisted
- [ ] `getRubricTierForRank` implementation unchanged
- [ ] `npx tsc --noEmit` exits 0
- [ ] Only in-scope files modified

## STOP conditions

- Preview already has an equivalent enlisted gate (then skip Step 2 and report).
- Rank resolution returns a sentinel that is not null but also not a real rank — STOP and report rather than guessing.

## Maintenance notes

- When `getRubricTierForRank(null)` is eventually fixed globally, these API gates remain correct (fail closed).
- Reviewers: ensure officers cannot bill preview/talking-points.
