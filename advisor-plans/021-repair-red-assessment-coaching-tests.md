# Plan 021: Get `npm test` green again on `main` (stale assessment-coaching tip assertions)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 044b1be..HEAD -- src/lib/assessment-coaching.ts src/lib/__tests__/assessment-coaching.test.ts`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `044b1be`, 2026-08-01

## Why this matters

`npm test` (vitest) is the only one-command verification gate in this repo, and
it is currently **red on `main`**: 1 failed / 403 passed. The failure is not a
real product bug — commit `a46d3d3` ("Charge one credit for multi-version
generate and ship stewardship EPB tooling") rewrote two coaching tip bodies in
`src/lib/assessment-coaching.ts` to the Air Force stewardship-lever wording but
left `src/lib/__tests__/assessment-coaching.test.ts` asserting the pre-stewardship
strings.

The cost is real even though the bug is not: every advisor plan in this repo
uses `npm test` as its done-criteria gate, so a permanently-red suite trains
executors (and humans) to ignore the gate, and a genuinely broken test lands
invisibly behind the known failure. Fix the assertions, and add a guard so the
tip copy and its tests cannot silently diverge again.

## Current state

Files:

- `src/lib/assessment-coaching.ts` — source of truth for coaching tip copy; the
  `INDICATOR_TIPS` map at lines 23–43 holds the four quality-indicator tips.
- `src/lib/__tests__/assessment-coaching.test.ts` — the vitest suite; the failing
  assertions are at lines 76–84.

Live tip bodies (`src/lib/assessment-coaching.ts:23-43`):

```ts
const INDICATOR_TIPS: Record<
  QualityIndicatorKey,
  Pick<AssessmentCoachingTip, "title" | "body">
> = {
  action_clarity: {
    title: "Action clarity",
    body: "Lead with a concrete verb + object. Cut filler so a rater can see exactly what was done in one read.",
  },
  impact_significance: {
    title: "Impact",
    body: "Capture stewardship payoff: man-hours recovered, finishing early vs on-time, cost avoidance, or equipment/manpower capacity — then the readiness or mission result it funded. On-time alone is weaker than a clear early/% faster delta.",
  },
  metrics_quality: {
    title: "Metrics",
    body: "Quantify the lever (man-hrs, $, FMC/sortie/count) with a baseline → result — e.g. 6 mos → 3 wks, 3 mos early, 45% faster. Vague \"improved mission\" or \"finished on time\" will not carry an EPB bullet.",
  },
  scope_definition: {
    title: "Scope",
    body: "Clarify scale: solo task, team of N, flight/squadron program, or wing-wide.",
  },
};
```

Stale assertions (`src/lib/__tests__/assessment-coaching.test.ts:71-85`):

```ts
    expect(tips.map((t) => t.id)).toEqual([
      "impact_significance",
      "metrics_quality",
      "action_clarity",
    ]);
    expect(tips[0].body).toBe(
      "Spell out who benefited and what changed (section, unit, or mission outcome) — not only that the task was finished."
    );
    expect(tips[1].body).toBe(
      'Add a baseline → result number (%, count, hours, errors, dollars). Vague "improved" will not carry an EPB bullet.'
    );
    expect(tips[2].body).toBe(
      "Lead with a concrete verb + object. Cut filler so a rater can see exactly what was done in one read."
    );
    assertRateeNeutralCopy(tips);
```

Only `tips[0]` currently reports as failed because vitest stops the test at the
first failed assertion — **`tips[1]` is stale too** and will fail as soon as
`tips[0]` is fixed. `tips[2]` (action clarity) still matches.

Repo conventions this plan must honor:

- Tests are colocated in `src/lib/__tests__/*.test.ts` and use `vitest`
  (`import { describe, expect, it } from "vitest"`). See
  `src/lib/__tests__/assessment-coaching.test.ts:1-42` for the existing shape,
  including the `makeScores()` factory and the `assertRateeNeutralCopy()` helper.
- Coaching copy is deliberately **ratee-neutral**: the existing
  `assertRateeNeutralCopy` helper (lines 38–42) rejects any tip whose
  `title + body` matches `/\b(you|your|my)\b/i`. Do not introduce second-person
  copy, and keep that assertion in place.
- Do not change product copy to satisfy a test. The strings in
  `assessment-coaching.ts` are the shipped stewardship wording and are correct;
  the test is what is stale.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                                    | exit 0, no output   |
| One test  | `npx vitest run src/lib/__tests__/assessment-coaching.test.ts` | all pass |
| Full tests| `npm test`                                            | exit 0, 0 failed    |
| Lint      | `npm run lint`                                        | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/__tests__/assessment-coaching.test.ts`
- `advisor-plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/assessment-coaching.ts` — the tip copy is correct and shipped; the
  only acceptable change to this file in this plan is **none**. If you believe
  the copy is wrong, that is a product decision, not this plan.
- Any other test file. The rest of the suite (35 files, 403 tests) is green;
  do not "tidy" it.
- The uncommitted working-tree changes in `src/app/(app)/entries/page.tsx`,
  `src/components/entries/*`, `src/components/ui/hide-on-scroll.tsx`, and
  `src/components/layout/usage-indicator.tsx`. They are someone else's
  in-progress work and are unrelated to this failure.

## Git workflow

- Branch: `advisor/021-repair-red-assessment-coaching-tests`
- Commit style matches `git log` on this repo: a single imperative sentence
  ending in a period, e.g. `Realign assessment coaching tests with stewardship tip copy.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the failure reproduces

Run `npx vitest run src/lib/__tests__/assessment-coaching.test.ts`.

**Verify**: exactly one test fails —
`getAssessmentCoachingTips > returns weak tips ordered by ascending score with exact bodies` —
with `Expected: "Spell out who benefited..."` / `Received: "Capture stewardship payoff..."`.
If a *different* test fails, or none fail, treat it as a STOP condition.

### Step 2: Import the tip copy instead of hardcoding it

Rather than pasting the new strings (which would go stale the next time copy
changes), export the tip map from the module under test and assert against it.

1. In `src/lib/assessment-coaching.ts` — **exception to the out-of-scope rule,
   and the only change permitted there**: add the `export` keyword to the
   existing `const INDICATOR_TIPS` declaration at line 23. Change nothing else
   on that line or in the object body.

   ```ts
   export const INDICATOR_TIPS: Record<
   ```

2. In `src/lib/__tests__/assessment-coaching.test.ts`, add `INDICATOR_TIPS` to
   the existing import block at lines 2–7:

   ```ts
   import {
     getAssessmentChrome,
     getAssessmentCoachingTips,
     INDICATOR_TIPS,
     INDICATOR_WEAK_THRESHOLD,
     isAssessmentStale,
   } from "../assessment-coaching";
   ```

3. Replace the three hardcoded `expect(tips[N].body).toBe("...")` assertions at
   lines 76–84 with map-driven ones:

   ```ts
   expect(tips[0].body).toBe(INDICATOR_TIPS.impact_significance.body);
   expect(tips[1].body).toBe(INDICATOR_TIPS.metrics_quality.body);
   expect(tips[2].body).toBe(INDICATOR_TIPS.action_clarity.body);
   ```

   Leave the `expect(tips.map((t) => t.id)).toEqual([...])` ordering assertion
   at lines 71–75 and the trailing `assertRateeNeutralCopy(tips)` exactly as
   they are — the ordering assertion is the part of this test that has real
   behavioral value, and `assertRateeNeutralCopy` is what keeps the copy
   ratee-neutral now that the bodies are no longer spelled out inline.

**Verify**: `npx vitest run src/lib/__tests__/assessment-coaching.test.ts` →
all tests in the file pass.

### Step 3: Add a copy-contract test so this cannot silently rot again

The reason the suite went red is that nothing tied the tip map to its
constraints. Append a new `describe` block at the end of
`src/lib/__tests__/assessment-coaching.test.ts` (after the existing
`describe("getAssessmentChrome", ...)` block), modeled on the existing blocks in
the same file:

```ts
describe("INDICATOR_TIPS copy contract", () => {
  const keys = [
    "action_clarity",
    "impact_significance",
    "metrics_quality",
    "scope_definition",
  ] as const;

  it("has a non-empty title and body for every quality indicator", () => {
    for (const key of keys) {
      expect(INDICATOR_TIPS[key].title.trim().length).toBeGreaterThan(0);
      expect(INDICATOR_TIPS[key].body.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every tip ratee-neutral", () => {
    for (const key of keys) {
      const tip = INDICATOR_TIPS[key];
      expect(`${tip.title} ${tip.body}`).not.toMatch(SECOND_PERSON_PATTERN);
    }
  });
});
```

`SECOND_PERSON_PATTERN` already exists at line 11 of the same file — reuse it,
do not redeclare it.

**Verify**: `npx vitest run src/lib/__tests__/assessment-coaching.test.ts` →
all pass, including the 2 new tests.

### Step 4: Confirm the whole suite is green

**Verify**: `npm test` → `Test Files 36 passed (36)`, `Tests 406 passed (406)`
(404 existing + 2 new; the exact totals may differ if other work landed — the
required outcome is **0 failed**).

Then `npx tsc --noEmit` → exit 0, and `npm run lint` → exit 0.

## Test plan

- Modified: `src/lib/__tests__/assessment-coaching.test.ts` — the "exact bodies"
  test now compares against the exported `INDICATOR_TIPS` map rather than
  hardcoded strings, so it verifies *tip selection and ordering* (the real
  behavior) instead of copy-editing history.
- New: `describe("INDICATOR_TIPS copy contract")` with two cases — every
  indicator has non-empty title/body, and no tip uses second-person copy.
- Structural pattern to follow: the existing `describe` blocks in the same file.
- Verification: `npm test` → 0 failed.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0 with 0 failed tests
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `rg -n "Spell out who benefited" src/` returns no matches
- [ ] `rg -n 'Add a baseline → result number' src/lib/__tests__/` returns no matches
- [ ] `git status` shows only `src/lib/assessment-coaching.ts` (one-word `export` change),
      `src/lib/__tests__/assessment-coaching.test.ts`, and `advisor-plans/README.md`
      modified relative to the pre-existing dirty tree
- [ ] `advisor-plans/README.md` row for 021 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows a different failing test, or shows the suite already green
  (someone fixed it first — say so and stop).
- The tip bodies in `src/lib/assessment-coaching.ts` no longer match the
  "Current state" excerpt (copy changed again since this plan was written).
- Making the test pass appears to require editing `assessment-coaching.ts`
  beyond adding the `export` keyword. It does not; if you think it does, stop.
- `npm test` still reports failures after step 4 that are **not** in
  `assessment-coaching.test.ts` — those are separate findings; report them and
  do not attempt to fix them here.

## Maintenance notes

- Reviewer should confirm no product copy changed: the diff on
  `src/lib/assessment-coaching.ts` must be exactly one word (`export`).
- Future copy edits to `INDICATOR_TIPS` now only need to satisfy the
  ratee-neutral contract; they will not break the ordering test.
- Deferred: this repo has no CI gate that runs `npm test` on push. That is why a
  red suite survived multiple commits. Adding a `test` job to
  `.github/workflows/` is the natural follow-up and is intentionally not part of
  this plan.
