# Plan 005: Add deterministic cycle performance portfolio from assessment_scores

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b47bdfe..HEAD -- src/components/epb/epb-progress-card.tsx src/types/database.ts src/lib/constants.ts src/app/(app)/entries/page.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `b47bdfe`, 2026-07-21
- **Revised**: 2026-07-21 — dual audience (self + supervisor/rater)

## Why this matters

`accomplishments.assessment_scores` already stores per-entry MPA relevancy, overall quality, and quality indicators for the EPB cycle — but the only cycle UI (`EPBProgressCard`) counts entries per MPA. The Entries page is used in **two modes**:

1. **Self** — Airman logging and reflecting on their own package
2. **Rater** — supervisor viewing a registered subordinate or managed member and curating the package / feedback for that ratee

The portfolio must describe **the ratee's cycle evidence**, not “your progress,” and must key closeout / enlisted gating off the **ratee’s rank**, not the logged-in viewer’s rank (today the card is wired with `profile.rank` even when the list is filtered to someone else).

## Current state

- Schema / shape — `supabase/migrations/092_accomplishment_assessment_scores.sql` and `src/types/database.ts` L77–99:

```ts
export interface AccomplishmentAssessmentScores {
  mpa_relevancy: AccomplishmentMPARelevancy; // executing_mission, leading_people, managing_resources, improving_unit
  overall_score: number;
  quality_indicators: AccomplishmentQualityIndicators; // action_clarity, impact_significance, metrics_quality, scope_definition
  primary_mpa: string;
  secondary_mpa: string | null;
}
```

- `src/components/epb/epb-progress-card.tsx` — count-only readiness (L48–116). `RECOMMENDED_ENTRIES_PER_MPA = 3`. Uses `entry.mpa` counts only; **never reads** `assessment_scores`.
- Wired from `src/app/(app)/entries/page.tsx` L279–285 with **viewer** rank (bug for rater mode):

```tsx
{profile?.rank !== "Civilian" && (
  <EPBProgressCard
    rank={profile?.rank as Rank | null}
    entries={accomplishments}
  />
)}
```

- Same page already resolves ratee context for the dialog: `selectedUser`, `isManagedMember`, `managedMemberId`, and passes `targetUserId` / `targetManagedMemberId` into `EntryFormDialog` (L709–715). Reuse that resolution for the progress card’s `rank`.
- `ENTRY_MGAS` in `src/lib/constants.ts` L7–13 includes four ACA MPAs **plus** `miscellaneous`. Assessment `mpa_relevancy` only has the four ACA keys — portfolio quality math must use those four only.
- Pure-lib test pattern: `src/lib/__tests__/scod-dates.test.ts`.
- Repo scripts: `npm test`, `npm run lint`. No `typecheck` script — use `npx tsc --noEmit` if needed.
- **Hard constraint**: do **not** add any new `useEffect`. Derive portfolio with `useMemo` from `entries`.

## Audience & voice (non-negotiable)

**Subject of the data = ratee. Viewer may be self or rater.**

| Layer | Rule |
|-------|------|
| Numbers / rollups | Always about the filtered entry set (the person being viewed) |
| Coaching line copy | **Ratee-neutral**: no “you/your/my”. Prefer “this package”, “this MPA”, “entries”, “the ratee” only if a name is passed — default to impersonal |
| Chrome (titles, empty states) | May adapt with `viewerRole: "self" \| "rater"` |
| Enlisted quality section | Gate on **ratee** `isEnlisted(rank)`, not viewer |

Do **not** maintain two full coaching corpora. One neutral corpus + small chrome swaps is enough and stays maintainable.

## Commands you will need

| Purpose   | Command                                      | Expected on success        |
|-----------|----------------------------------------------|----------------------------|
| Tests     | `npm test -- src/lib/__tests__/cycle-portfolio.test.ts` | all pass            |
| Lint      | `npm run lint`                               | exit 0                     |
| Optional  | `npx tsc --noEmit`                           | exit 0                     |

## Scope

**In scope** (the only files you should create/modify):
- `src/lib/cycle-portfolio.ts` (create)
- `src/lib/__tests__/cycle-portfolio.test.ts` (create)
- `src/components/epb/epb-progress-card.tsx` (extend UI + optional `viewerRole` prop)
- `src/app/(app)/entries/page.tsx` (pass **ratee** rank + `viewerRole`; fix civilian/officer gate to use ratee)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- Assessment API routes (`assess-accomplishment`, `assess-accomplishment-preview`, `assess-epb`) — ratee-rank fix for preview is plan **006**
- Entry form coaching (plan 006)
- EPB action selector / statement generation
- New migrations / DB views / RPCs
- Charts (recharts)
- Officer ACA assessment, promotion prediction, mid-cycle mock ACA LLM check-in
- Persisting portfolio snapshots
- Any new `useEffect`

## Git workflow

- Branch: `advisor/005-cycle-performance-portfolio` (or continue current feature branch if already on one for this work)
- Commit message example: `Add cycle performance portfolio from assessment scores`
- Do NOT push or open a PR unless the operator instructed it.

## Design (implement exactly)

### Pure library: `buildCyclePortfolio(entries)`

Create `src/lib/cycle-portfolio.ts` exporting:

```ts
export const ACA_PORTFOLIO_MPA_KEYS = [
  "executing_mission",
  "leading_people",
  "managing_resources",
  "improving_unit",
] as const;

export type AcaPortfolioMpaKey = (typeof ACA_PORTFOLIO_MPA_KEYS)[number];

export const PORTFOLIO_QUALITY_FLOOR = 60;
export const PORTFOLIO_METRICS_FLOOR = 50;
export const PORTFOLIO_MISFILE_GAP = 20;

export interface CycleMpaPortfolioStat {
  mpaKey: AcaPortfolioMpaKey;
  entryCount: number;
  assessedCount: number;
  avgOverall: number | null;
  avgRelevancy: number | null;
  avgMetrics: number | null;
  misfiledCount: number;
}

export interface CycleQualityFingerprint {
  assessedEntryCount: number;
  avgOverall: number | null;
  avgActionClarity: number | null;
  avgImpact: number | null;
  avgMetrics: number | null;
  avgScope: number | null;
  weakestIndicator: "action_clarity" | "impact_significance" | "metrics_quality" | "scope_definition" | null;
}

export interface CyclePortfolio {
  mpaStats: Record<AcaPortfolioMpaKey, CycleMpaPortfolioStat>;
  fingerprint: CycleQualityFingerprint;
  /** 0–3 short ratee-neutral guidance lines */
  coachingLines: string[];
  volumeReadyMpas: number;
  qualityReadyMpas: number;
  hasAnyAssessments: boolean;
}

export function buildCyclePortfolio(entries: Accomplishment[]): CyclePortfolio;
```

Rules:
1. Only ACA keys in `mpaStats`. Ignore `miscellaneous` / unknown for quality math.
2. Averages: mean; `null` when `assessedCount === 0`. Prefer **Math.round** on returned averages.
3. `misfiledCount`: tagged `entry.mpa === mpaKey`, `primary_mpa` different ACA key, and `(relevancy[primary] - relevancy[mpaKey]) >= PORTFOLIO_MISFILE_GAP`.
4. `coachingLines` (max 3), **exact ratee-neutral copy**:

| Condition | Line |
|-----------|------|
| `entryCount === 0` | `No {Label} entries yet — add at least one before closeout.` |
| `0 < entryCount < 3` | `{Label} has {n}/3 recommended entries.` |
| assessed + `avgOverall < QUALITY_FLOOR` | `{Label} average quality is {avg} — strengthen impact and metrics on those entries.` |
| fingerprint metrics `< METRICS_FLOOR` | `Cycle-wide metrics are the weak spot (avg {n}). Prefer baseline → result numbers.` |
| any `misfiledCount > 0` | `{n} entr(y/ies) may be miscategorized — compare AI Best Fit to the tagged MPA.` |
| nothing weak + assessments + all 4 MPAs ≥ 1 entry | `Solid MPA coverage — keep logging quantified wins through closeout.` |

5. Labels from `ENTRY_MGAS` (`Leading People`, etc.).

### UI: `EPBProgressCard` + Entries wiring

**Props additions** (backward compatible defaults):

```ts
interface EPBProgressCardProps {
  rank: Rank | null; // RATEE rank (closeout + enlisted gate)
  entries: Accomplishment[];
  statements?: { mpa: string }[];
  className?: string;
  compact?: boolean;
  title?: string;
  defaultCollapsed?: boolean;
  /** Who is looking: self reflecting vs rater curating. Default "self". */
  viewerRole?: "self" | "rater";
}
```

**Entries page** must compute ratee rank the same way `EntryFormDialog` does (`targetRateeRank` pattern):

- `selectedUser === "self"` → `profile.rank`
- registered subordinate id → that subordinate’s rank
- `managed:{id}` → managed member’s rank

Pass:

```tsx
<EPBProgressCard
  rank={rateeRank}
  entries={accomplishments}
  viewerRole={selectedUser === "self" ? "self" : "rater"}
/>
```

Show the card when **ratee** is not Civilian (not when viewer is not Civilian). Officer supervisor + enlisted ratee ⇒ card + quality section. Enlisted supervisor + officer ratee ⇒ counts only (no quality section), matching assessment product limits.

**Quality section** (expanded, `isEnlisted(rank)` on **ratee**):

- Section heading chrome:
  - self: `Quality insights`
  - rater: `Package quality insights`
- Empty assessments:
  - self: `Assess entries to unlock cycle quality insights.`
  - rater: `Assess entries in this package to unlock cycle quality insights.`
- Body (shared): fingerprint row; per-ACA MPA avg quality; up to 3 `coachingLines`
- Optional one-line helper under coaching when `viewerRole === "rater"`: `Use these notes when giving feedback or prioritizing what to gather next.` (not a second coaching corpus)

Collapsed summary: if enlisted ratee + assessments, append `• avg quality {n}`.

Match existing Tailwind / shadcn patterns in the card. No new CSS file. No nested card clutter.

## Steps

### Step 1: Implement `buildCyclePortfolio` + tests

Minimum cases:
1. Empty → `hasAnyAssessments: false`; no “solid coverage” line
2. Null assessments → volume works; fingerprint assessed 0
3. Four strong assessed entries → `qualityReadyMpas === 4` + solid-coverage line (exact string)
4. Low metrics fingerprint → metrics line (exact string)
5. Misfile gap ≥ 20 → count + misfile line
6. `miscellaneous` excluded from ACA averages
7. Assert coaching strings contain **no** `\byour\b` / `\byou\b` / `\bmy\b` (case-insensitive) — locks dual-audience voice

**Verify**: `npm test -- src/lib/__tests__/cycle-portfolio.test.ts` → all pass

### Step 2: Wire ratee rank + quality UI

Update Entries page + `EPBProgressCard` per Design.

**Verify**: `npm run lint` → exit 0; `npx tsc --noEmit` → exit 0 (STOP on unrelated pre-existing errors — do not boil the ocean)

### Step 3: Update plans index

Set plan 005 status to DONE in `plans/README.md`.

## Test plan

- `src/lib/__tests__/cycle-portfolio.test.ts` modeled on `scod-dates.test.ts`
- Cases in Step 1 including the you/your/my ban
- Manual smoke: as supervisor, select a managed/subordinate enlisted member → card closeout/quality reflects **their** rank and package, chrome says “Package quality insights”

## Done criteria

- [ ] Unit tests pass (including ratee-neutral copy assertion)
- [ ] Entries page passes **ratee** rank and `viewerRole` into `EPBProgressCard`
- [ ] Quality section gated on ratee `isEnlisted`, visible to officer raters viewing enlisted packages
- [ ] Coaching lines have no second-person / first-person possessive self-talk
- [ ] No new `useEffect`
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row for 005 = DONE

## STOP conditions

- Drift check fails / excerpts mismatch.
- `assessment_scores` shape no longer matches types.
- Cannot resolve ratee rank from existing store fields on Entries page — report; do not invent new fetches without asking.
- Migration or LLM appears required.
- Verification fails twice after a reasonable fix.

## Maintenance notes

- Plan 006 owns entry-level tip voice + assess preview rateeRank; keep modules separate.
- Roadmap supervisor digest should reuse `buildCyclePortfolio` + the same neutral lines (paste-friendly for feedback sessions).
- Reviewer focus: ratee vs viewer rank, dual-audience chrome, Misc excluded from quality math, collapse summary layout shift.
- Do not auto-derive `ACA_PORTFOLIO_MPA_KEYS` from `ENTRY_MGAS` (Misc is not an ACA score key).
