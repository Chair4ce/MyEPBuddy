# Plan 006: Indicator-driven assessment guidance for self and raters

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b47bdfe..HEAD -- src/components/entries/entry-form-dialog.tsx src/types/database.ts src/app/api/assess-accomplishment-preview/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (touches preview API request shape for ratee rank — keep additive)
- **Depends on**: none (can ship in parallel with 005)
- **Category**: direction
- **Planned at**: commit `b47bdfe`, 2026-07-21
- **Revised**: 2026-07-21 — dual audience (self + supervisor/rater); ratee-rank for preview

## Why this matters

"Rate My Accomplishment" already returns structured `quality_indicators` and MPA fit, but the UI ends with a **generic** tip and speaks as if the viewer is always the subject (“Rate **My**…”, “what **you** did”). Entries are also created by **supervisors for subordinates / managed members**. Guidance must:

1. Tell anyone editing the entry **what to strengthen in the write-up** (ratee-neutral tip bodies — pasteable into feedback)
2. Adapt **chrome** (button / section labels) for self vs rater
3. Score against the **ratee’s** ACA tier/rank, not the supervisor’s

Today the dialog computes `targetRateeRank` (L82–90) for cycle year, but assessment UI and preview API still use the **logged-in profile rank** — wrong for rater mode.

## Current state

- Assessment shape — `src/types/database.ts` L85–99.
- Dialog already has ratee resolution:

```ts
const targetRateeRank = (() => {
  if (targetManagedMemberId) {
    return (managedMembers.find((m) => m.id === targetManagedMemberId)?.rank ?? null) as Rank | null;
  }
  if (targetUserId && targetUserId !== profile?.id) {
    return (subordinates.find((s) => s.id === targetUserId)?.rank ?? null) as Rank | null;
  }
  return (profile?.rank ?? null) as Rank | null;
})();
```

- But UI gate / button / background assess still use `isEnlisted(profile?.rank)` (L352, L410, L583) and CTA copy “Rate My Accomplishment” (L606).
- Preview API `src/app/api/assess-accomplishment-preview/route.ts` builds the prompt with `profile?.rank` of the **caller** (L226–232, L269–271) and does not accept a ratee rank in the body.
- Static tip L706–708 is first/second-person flavored and non-specific.
- **Hard constraint**: no new `useEffect`. Leave the existing form-reset effect alone.

## Audience & voice (non-negotiable)

| Layer | Rule |
|-------|------|
| Tip **bodies** | Ratee-neutral. No “you/your/my”. Readable as self-reflection **or** supervisor feedback notes |
| Tip **titles** | Short nouns: `Action clarity`, `Impact`, `Metrics`, `Scope`, `MPA fit` |
| Chrome | Adapt with `viewerRole: "self" \| "rater"` derived from `targetUserId` / `targetManagedMemberId` vs `profile.id` |
| Assessment availability | Gate on `isEnlisted(targetRateeRank)`, not viewer rank |

**Better than two corpora:** one neutral tip table + chrome swaps. Supervisors should be able to copy the tip list into a feedback conversation without rewriting pronouns.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm test -- src/lib/__tests__/assessment-coaching.test.ts` | all pass |
| Lint    | `npm run lint` | exit 0 |
| Optional | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/lib/assessment-coaching.ts` (create)
- `src/lib/__tests__/assessment-coaching.test.ts` (create)
- `src/components/entries/entry-form-dialog.tsx` (tips UI, chrome, gates, pass `rateeRank` to preview)
- `src/app/api/assess-accomplishment-preview/route.ts` (accept optional `rateeRank`; authorize + use for rubric)
- `plans/README.md` (status row only)

**Out of scope**:
- Changing persisted assess (`/api/assess-accomplishment`) prompt/schema beyond what’s required for consistency — **if** background assess already loads the accomplishment owner incorrectly for managed members, STOP and report (known risk); do not expand into a full assess-route rewrite unless the bug blocks rater preview. Prefer fixing **preview** thoroughly in this plan.
- LLM rewrite / “Improve this entry”
- Cycle portfolio UI (plan 005)
- Entries-list coaching chips
- Persisting tip text to DB
- New `useEffect` hooks
- Officer ACA product expansion

## Git workflow

- Branch: `advisor/006-indicator-driven-assessment-coaching` (or shared with 005)
- Commit message example: `Add dual-audience assessment guidance and ratee-ranked preview`
- Do NOT push or open a PR unless the operator instructed it.

## Design (implement exactly)

### 1) Pure library: `src/lib/assessment-coaching.ts`

```ts
export const INDICATOR_WEAK_THRESHOLD = 60;
export const MISFILE_RELEVANCY_GAP = 20;

export type QualityIndicatorKey =
  | "action_clarity"
  | "impact_significance"
  | "metrics_quality"
  | "scope_definition";

export interface AssessmentCoachingTip {
  id: QualityIndicatorKey | "misfile" | "strong";
  indicator?: QualityIndicatorKey;
  title: string;
  body: string;
  severity: "weak" | "info" | "strong";
}

export function getAssessmentCoachingTips(
  scores: AccomplishmentAssessmentScores,
  selectedMpa: string
): AssessmentCoachingTip[];
```

**Exact tip bodies** (ratee-neutral):

| Key | title | body |
|-----|-------|------|
| `action_clarity` | Action clarity | Lead with a concrete verb + object. Cut filler so a rater can see exactly what was done in one read. |
| `impact_significance` | Impact | Spell out who benefited and what changed (section, unit, or mission outcome) — not only that the task was finished. |
| `metrics_quality` | Metrics | Add a baseline → result number (%, count, hours, errors, dollars). Vague “improved” will not carry an EPB bullet. |
| `scope_definition` | Scope | Clarify scale: solo task, team of N, flight/squadron program, or wing-wide. |

Misfile (`info`):

- title: `MPA fit`
- body: `AI Best Fit is {primaryLabel}, not the selected {selectedLabel}. Recategorize if the work truly matches that MPA.`

Strong (only when no weak + no misfile):

- title: `Ready for the package`
- body: `Quality indicators clear the bar. Keep numbers tight when drafting the EPB statement from this entry.`

Order: weak by ascending score, then misfile, then strong. Cap **4** tips. Strong is alone when used.

Add a tiny chrome helper (same file or adjacent export):

```ts
export type AssessmentViewerRole = "self" | "rater";

export function getAssessmentChrome(role: AssessmentViewerRole): {
  sectionLabel: string;
  ctaLabel: string;
  ctaRelabel: string; // when assessment already present
  emptyHint: string;
  tipsHeading: string;
} {
  // self:
  //   sectionLabel: "AI Assessment"
  //   ctaLabel: "Assess entry"
  //   ctaRelabel: "Re-assess"
  //   emptyHint: "Assess this entry to see MPA fit, quality breakdown, and improvement notes."
  //   tipsHeading: "Improvement notes"
  // rater:
  //   sectionLabel: "AI Assessment"
  //   ctaLabel: "Assess entry"
  //   ctaRelabel: "Re-assess"
  //   emptyHint: "Assess this entry to score MPA fit and capture feedback notes for the ratee."
  //   tipsHeading: "Feedback notes"
}
```

Note: drop “Rate **My** Accomplishment” entirely — shared CTA `Assess entry` is dual-audience. Only empty hint / tips heading differ.

### 2) Preview API: accept ratee rank

In `assess-accomplishment-preview/route.ts`:

1. Extend body: optional `rateeRank?: string | null` (and keep existing fields).
2. Resolve effective rank:
   - If `rateeRank` provided: validate it is a known `Rank` string used by the app; use it for rubric / `isCivilian` / `getRubricTierForRank`.
   - Else: fall back to caller profile rank (backward compatible).
3. **Authorization when `rateeRank` is supplied and differs from caller rank** (pick the simplest correct check that matches existing app patterns):
   - Allow if caller has that person in `subordinates` / can manage a managed member with that rank context, **or**
   - Allow if `rateeRank` matches a subordinate/managed member linked in the request — better: also accept optional `targetUserId` / `targetManagedMemberId` and verify supervision/management relationship server-side before trusting rank.
4. Preferred request shape from the dialog:

```json
{
  "action_verb": "...",
  "details": "...",
  "impact": null,
  "metrics": null,
  "mpa": "leading_people",
  "rateeRank": "SSgt",
  "targetUserId": "<uuid|null>",
  "targetManagedMemberId": "<uuid|null>"
}
```

5. Server must **not** blindly trust `rateeRank` alone. Verify:
   - self: `!targetUserId && !targetManagedMemberId` → use caller profile rank (ignore mismatched client rank or overwrite)
   - subordinate: `targetUserId` is an active supervisee of caller → load that profile’s rank from DB (prefer DB rank over client)
   - managed: `targetManagedMemberId` belongs to caller → load managed member rank from DB
6. If relationship check fails → `403`.
7. Response still returns `{ assessment, model, rubricTier, formUsed, rateeRank }` using the **resolved** ratee rank.

Keep billable / usage / sensitive-scan behavior unchanged.

### 3) Dialog UI

1. `viewerRole`: `"rater"` when `targetManagedMemberId` or (`targetUserId` && `targetUserId !== profile?.id`), else `"self"`.
2. Show assessment block when `isEnlisted(targetRateeRank)` (not `profile.rank`).
3. Background post-save assess triggers: same enlisted gate on **ratee**.
4. `handleRateAccomplishment`: POST preview with `rateeRank: targetRateeRank`, plus target ids as above.
5. Replace static tip with `getAssessmentCoachingTips` list under `chrome.tipsHeading`.
6. Weak tip styling: amber family already used by `getScoreColor`; strong/info muted.
7. `aria-label` on tips region: use `chrome.tipsHeading` (not “coaching for you”).
8. Optional small **Copy notes** control when `viewerRole === "rater"` and tips.length > 0: copies `tips.map(t => `${t.title}: ${t.body}`).join("\n")` via `navigator.clipboard.writeText` + toast. Use existing Button variant ghost/sm. No new dependencies.
9. Quality breakdown rows: emphasize indicators `< INDICATOR_WEAK_THRESHOLD` via existing color helpers (no heavy badges).

## Steps

### Step 1: Library + unit tests

Cover tip ordering, exact bodies, misfile gap, cap, strong path, and assert tip bodies match `/you|your|my/i` → **no matches**.

Also unit-test `getAssessmentChrome` returns distinct `tipsHeading` / `emptyHint` for self vs rater and shared `ctaLabel === "Assess entry"`.

**Verify**: `npm test -- src/lib/__tests__/assessment-coaching.test.ts` → all pass

### Step 2: Preview API ratee resolution

Implement authorized ratee rank resolution. Prefer DB rank over client-supplied rank once the target id is verified.

**Verify**: `npm run lint` → exit 0. Manually or via a focused test if one exists for route handlers — if no API test harness, document manual check: supervisor assessing managed enlisted member returns `formUsed` / `rateeRank` for **member**, not supervisor.

### Step 3: Dialog chrome + tips + copy notes

Wire gates, CTA, tips, copy button.

**Verify**: lint clean; smoke self + rater paths.

### Step 4: Update plans index

Mark 006 DONE in `plans/README.md`.

## Test plan

- `src/lib/__tests__/assessment-coaching.test.ts` (exact strings + pronoun ban + chrome)
- Manual: supervisor on managed member → Assess entry → rubric line shows member rank; tips say “Feedback notes”; Copy notes works
- Manual: self → tips say “Improvement notes”; same tip bodies

## Done criteria

- [ ] Unit tests pass; tip bodies have no you/your/my
- [ ] “Rate My Accomplishment” string gone from dialog (`grep -n "Rate My Accomplishment" src/components/entries/entry-form-dialog.tsx` → no matches)
- [ ] Static generic tip gone
- [ ] Assessment UI gated on ratee enlisted rank
- [ ] Preview uses authorized **ratee** rank for ACA rubric
- [ ] Rater gets Feedback notes + Copy notes; self gets Improvement notes
- [ ] No new LLM narrative fields; no new `useEffect`
- [ ] In-scope files only; README status DONE

## STOP conditions

- Cannot verify subordinate/managed ownership with existing tables/queries used elsewhere — stop and report the auth gap rather than trusting client `rateeRank`.
- Fixing background `/api/assess-accomplishment` for managed-member ownership is larger than preview — report separately; do not silently leave raters with correct preview but wrong persisted scores without calling it out in the PR/notes.
- Product asks for fully different tip paragraphs per audience — push back: chrome + neutral bodies is the intended design; only escalate if operator insists.
- Verification fails twice after a reasonable fix.

## Maintenance notes

- Roadmap “Improve this entry” can feed weak tip ids into a rewrite prompt.
- Plan 005 portfolio lines should stay stylistically consistent (ratee-neutral).
- Reviewer focus: IDOR on preview ratee selection, pronoun voice, CTA rename, copy-notes UX for raters, layout shift in dialog.
