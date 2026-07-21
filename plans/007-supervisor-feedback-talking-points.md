# Plan 007: Supervisor feedback talking-points generator (initial → midterm → final)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b47bdfe..HEAD -- src/components/team/feedback-session-dialog.tsx src/components/team/set-expectations-dialog.tsx src/app/actions/supervisor-feedbacks.ts src/app/actions/supervisor-expectations.ts src/types/database.ts src/lib/constants.ts src/lib/billable-api.ts src/lib/cycle-portfolio.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (new billable LLM route + authz over subordinate packages)
- **Depends on**: plans/005 preferred for portfolio summary input (soft). Shipable without 005 by inlining a minimal score rollup; if `src/lib/cycle-portfolio.ts` exists, **must** reuse it.
- **Category**: direction
- **Planned at**: commit `b47bdfe`, 2026-07-21
- **Supersedes roadmap item**: R3 (supervisor coaching digest)

## Why this matters

Supervisors already have a three-phase feedback lifecycle in the product (`FeedbackType`: `initial` | `midterm` | `final`) plus free-text `supervisor_expectations` and a draft/share/copy/print `FeedbackSessionDialog`. What they lack is an **AI-assisted first draft of session talking points** grounded in:

1. Expectations they set for the ratee (cycle kickoff / ACA framing)
2. Cycle accomplishments + existing `assessment_scores` (midterm / final)
3. Optional EPB statement text when present (final / post-EPB / EFDP prep)

This is **not** promotion or stratification prediction. It prepares the supervisor for a human conversation with evidence-based talking points (strengths, gaps, asks, risk areas). The Airman still gets feedback through the existing share flow; the LLM output is a **draft the supervisor edits**.

## Product framing (non-negotiable)

| Do | Do not |
|----|--------|
| “Generate talking points” / “Draft session notes” | “Predict stratification” / “Will they promote” / “EFDP score” |
| Phase-aware prompts using existing `FeedbackType` | A fourth lifecycle type unless product explicitly expands the enum |
| Seed **draft** `supervisor_feedbacks.content` for edit → share/print/copy | Auto-share to the ratee |
| Use stored `assessment_scores` + one synthesis LLM call | Re-score every accomplishment with a full LLM assess on every click (cost blowup) |
| Ratee-neutral evidence language in the draft (supervisor can personalize) | Second-person “you failed…” voice aimed at the Airman as if auto-delivered |

**Challenge to the “export” framing:** Prefer **Generate → edit in existing dialog → Copy/Print** over a parallel PDF export pipeline. Copy/Print already exist on `FeedbackSessionDialog`. A separate export format can come later if print is insufficient.

## Current state (ground truth)

- Types — `src/types/database.ts` L347–370:

```ts
export type FeedbackType = 'initial' | 'midterm' | 'final';
export type FeedbackStatus = 'draft' | 'shared';
export interface SupervisorFeedback {
  // ...
  feedback_type: FeedbackType;
  content: string;
  reviewed_accomplishment_ids: string[];
  status: FeedbackStatus;
  // ...
}
```

- Labels — `src/lib/constants.ts` L494–504 already match the user’s lifecycle:
  - initial: “ACA expectations and initial performance goals”
  - midterm: “Mid-cycle progress review and accomplishment assessment”
  - final: “End-of-cycle assessment after EPB completion”
- Expectations — `supervisor_expectations.expectation_text` (`099_supervisor_expectations.sql`); UI `set-expectations-dialog.tsx` tabs into feedback types 1/2/3.
- Feedback authoring — `feedback-session-dialog.tsx`: textarea draft, Save, Share, Copy, Print. **No AI generate today.**
- Billable paths — `src/lib/billable-api.ts` must list any new POST route.
- Dual-audience contract from plans 005/006: ratee is the subject; supervisor is the viewer/editor.
- ACA rubrics already in `src/lib/constants.ts` (`ACA_RUBRIC_JUNIOR` / `ACA_RUBRIC_SENIOR`) — reuse for prompt context like `assess-epb` / `assess-accomplishment`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |
| Optional | `npx tsc --noEmit` | exit 0 |
| Local DB (only if a migration is added) | Verify myepbuddy stack per workspace rule, then `supabase db push --local` | success |

## Scope

**In scope**:
- `src/app/api/generate-feedback-talking-points/route.ts` (create) — billable LLM synthesis
- `src/lib/feedback-talking-points.ts` (create) — prompt builders + response parse helpers (pure where possible)
- `src/lib/__tests__/feedback-talking-points.test.ts` (create)
- `src/components/team/feedback-session-dialog.tsx` — **Generate talking points** CTA + confirm-overwrite if content non-empty
- `src/lib/billable-api.ts` — register new path
- Wire usage/billing like peer assess/generate routes (`createBillableRequestContext`, `checkAndTrackUsage`, `TokenCostBadge` on button if used elsewhere in team UI)
- `plans/README.md` status row

**Soft reuse (do not duplicate)**:
- If present: `src/lib/cycle-portfolio.ts` `buildCyclePortfolio`
- `getExpectation` / accomplishment queries with existing RLS patterns
- ACA rubric helpers / `getRubricTierForRank`

**Out of scope**:
- Changing `FeedbackType` enum or adding `efdp` as a DB type (final covers post-EPB / EFDP **prep**)
- Auto-writing shared feedback without supervisor edit
- Predicting board outcomes, push/DNIF labels, or forced distribution
- Full batch re-assess of every accomplishment on generate (optional capped “assess missing scores first” is Phase B below — only if time; default skip)
- New print CSS redesign
- Officer ACA expansion beyond what assess routes already support
- Plans 005/006 UI work (except consuming 005 lib if it exists)
- New `useEffect` for generate flow — trigger from button handler only. (File already has load-on-open effects; do not add more for this feature.)

## Git workflow

- Branch: `advisor/007-supervisor-feedback-talking-points`
- Commit message example: `Add AI talking-points draft for supervisor feedback sessions`
- Do NOT push/PR unless asked.

## Design (implement exactly)

### A. API: `POST /api/generate-feedback-talking-points`

**AuthZ (must mirror existing supervisor actions):**
- Caller authenticated
- Target is either `subordinateId` (active supervisee) or `teamMemberId` (managed member owned by caller)
- Reject civilians / ranks with no ACA tier with a clear 400
- Never accept raw accomplishment blobs from the client as sole source of truth for IDs — load accomplishments server-side for that ratee + `cycleYear`

**Request body:**

```ts
{
  feedbackType: "initial" | "midterm" | "final";
  subordinateId?: string | null;
  teamMemberId?: string | null;
  cycleYear: number;
  model?: string;
}
```

**Server loads:**
1. Ratee profile/managed member (rank, name for labels only)
2. `supervisor_expectations` for this supervisor+ratee+cycle (may be null)
3. Accomplishments for ratee+cycle (include `assessment_scores`, action/details/impact/metrics/mpa/date)
4. For `final` only (best-effort): current-cycle EPB shell statements for that ratee if an existing query pattern exists in the codebase; if none is easy to find, **omit statements** and note in response `warnings: ["epb_statements_unavailable"]` — do not invent a new EPB schema.

**LLM input strategy (cost control):**
- Include expectation text (truncated if huge; keep head+tail or first ~4k chars with note)
- Include `buildCyclePortfolio(entries)` summary JSON if lib exists; else compact per-MPA avg overall / metrics / counts from assessed entries only
- Include top N accomplishments per MPA by `overall_score` (default N=3) as short structured lines — not full dump of 100 entries
- Include up to M lowest-scoring assessed entries across cycle (default M=3) as “risk evidence”
- Unassessed entries: count only + list titles/verbs for the thin MPAs (do not send every unassessed body unless total entries ≤ 12)

**Phase-specific output contract** (JSON only from model, then render to markdown/plaintext for the textarea):

```ts
type TalkingPointsDraft = {
  feedbackType: FeedbackType;
  headline: string; // one line session purpose
  sections: Array<{
    title: string;
    bullets: string[]; // talking points, not paragraphs of lecture
  }>;
  suggestedAsks: string[]; // concrete follow-ups / expectations for next period
  evidenceRefs: string[]; // short refs like "EM: Led X — overall 82" for supervisor prep (not for reading aloud verbatim)
};
```

Then server formats to a single plaintext string suitable for `FeedbackSessionDialog` textarea, e.g.:

```
## Session focus
...

## Strengths to recognize
- ...

## Gaps / risks
- ...

## Developmental asks
- ...

## Evidence to have handy
- ...
```

**Phase prompt intent:**

| Type | Primary inputs | Draft should emphasize |
|------|----------------|------------------------|
| `initial` | expectations (+ rank ACA rubric structure); accomplishments optional/sparse | Translate expectations into ACA-aligned standards, how success will be measured, check-in cadence. Minimal “performance grading.” |
| `midterm` | expectations + portfolio + accomplishments | Progress vs expectations, MPA balance, quality fingerprint (esp. metrics), what to gather before closeout |
| `final` | expectations + portfolio + accomplishments (+ EPB statements if available) | End-cycle narrative, what held for the package, remaining development, **EFDP discussion prep** framed as “evidence strength / package talking points” — never “you will/won’t strat” |

**Safety / tone in system prompt:**
- Supervisor-facing draft notes
- Fair, specific, evidence-tied
- No protected-class commentary
- No promotion/stratification predictions
- If evidence is thin, say so and recommend what to collect

**Response:**

```ts
{
  draftText: string;
  talkingPoints: TalkingPointsDraft;
  reviewedAccomplishmentIds: string[]; // ids included in evidence set
  model: string;
  warnings?: string[];
}
```

Register in `BILLABLE_API_PATHS`. Use same billing/usage patterns as `/api/assess-epb`.

### B. UI: `FeedbackSessionDialog`

1. Add primary-outline button near the textarea label row: **Generate talking points** with `TokenCostBadge` if that pattern is available in nearby team components; otherwise match assess-entry cost affordance used in entries.
2. Disabled when `isShared` or missing ratee ids.
3. On click:
   - If `content.trim()` non-empty → confirm AlertDialog: “Replace current draft with generated talking points? Undo is not available after replace.”
   - Call API; on success set `content` to `draftText` and stash `reviewedAccomplishmentIds` in component state to pass into `saveFeedback` on next save (extend local feedback state).
4. Button labels by type (chrome only):
   - initial: `Draft from expectations`
   - midterm: `Generate midterm talking points`
   - final: `Generate final session notes`
5. Helper text under button (muted, one line):
   - initial: `Uses saved expectations and the ACA rubric for this rank.`
   - midterm/final: `Uses expectations, assessed accomplishments, and cycle quality signals. Edit before sharing.`
6. Empty expectations on `initial`: allow generate but toast warning that draft will be rubric-generic; encourage setting expectations first (link/tab is in parent `SetExpectationsDialog` — do not navigate awkwardly; just toast).
7. Accessibility: `aria-label` on generate button including feedback type + member name.

### C. Optional Phase B (only if A+B done and time remains)

Capped “prepare scores” before generate: if >0 and ≤10 unassessed enlisted accomplishments, offer checkbox “Assess missing scores first (uses N credits)”. Sequentially or batched call existing assess endpoint. If >10 unassessed, skip and warn. **Do not block** generate on assessments.

### D. Persistence

No new table required for MVP. Saving still goes through `saveFeedback(..., reviewed_accomplishment_ids)`. Optionally store a marker line at top of content like `<!-- generated:feedback-talking-points -->` — **prefer not to**; keep content clean. If analytics needed later, add a column in a future migration.

## Steps

### Step 1: Pure prompt/format helpers + tests

Implement `src/lib/feedback-talking-points.ts`:
- `buildTalkingPointsUserPrompt({ feedbackType, ratee, expectations, portfolio, accomplishmentsSummary, epbStatements? })`
- `formatTalkingPointsDraft(draft) => string`
- Guardrails text constants (no strat prediction)

Tests:
1. format produces expected section headings
2. initial prompt includes expectations and ACA mention; midterm includes portfolio/accomplishments
3. truncation helper keeps prompt under a documented char budget
4. forbidden phrases list not present in system/guardrail strings: `/promot|stratif|forced distribution/i` should not appear as capability claims (mentioning EFDP as discussion context is OK if worded as prep)

**Verify**: `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` → pass

### Step 2: API route + billing registration

Implement route with authz, data load, generateText, parse JSON, format draftText, billable plumbing.

**Verify**: lint; manual smoke against local with a supervisee that has expectations + a few assessed entries.

### Step 3: Dialog CTA + overwrite confirm + save reviewed ids

Wire UI. Ensure Save persists `reviewed_accomplishment_ids` from the last generate.

**Verify**: lint; smoke initial/midterm/final; confirm shared feedback cannot regenerate.

### Step 4: README status

Mark 007 DONE (or PARTIAL if Phase B skipped — note in README).

## Test plan

- Unit: prompt/format helpers
- Manual authz: supervisor A cannot generate for supervisor B’s subordinate (expect 403)
- Manual: initial with expectations → ACA-structured asks
- Manual: midterm with thin metrics fingerprint → talking points call out metrics
- Manual: overwrite confirm when textarea dirty
- Manual: Copy/Print still work on generated content

## Done criteria

- [ ] Billable `POST /api/generate-feedback-talking-points` exists and is listed in `billable-api.ts`
- [ ] AuthZ prevents cross-team generation
- [ ] Phase-specific drafts for initial / midterm / final
- [ ] UI generates into draft textarea; never auto-shares
- [ ] No promotion/stratification prediction language in prompts or UI chrome
- [ ] `reviewed_accomplishment_ids` saved on subsequent save after generate
- [ ] Reuses `buildCyclePortfolio` when file exists
- [ ] No new `useEffect` for this feature
- [ ] `plans/README.md` updated

## STOP conditions

- Cannot establish supervisee/managed-member ownership with existing tables — stop; do not trust client-only IDs.
- EPB statement load requires speculative schema changes — omit statements and continue with warning.
- Product stakeholder demands automatic stratification labels — reject and report; out of scope.
- 005’s portfolio API differs from this plan’s assumed export — adapt to actual exports; do not fork a second portfolio implementation.
- Local supabase wrong project when adding a migration (only if you add one — MVP should not need one).

## Maintenance notes

- Future: attach generated drafts to ACA worksheet printables; still edit-first.
- Future: ratee-visible “shared summary” vs supervisor-only “evidenceRefs” split — today both live in one draft; supervisors should delete evidenceRefs section before share if too internal.
- Reviewer focus: IDOR, billing, prompt injection via expectation/accomplishment text (treat as untrusted data in prompts), cost controls on accomplishment volume, dual-audience (supervisor edits, ratee receives only after share).
- Plans 005/006 remain the cheap continuous signal; 007 is the expensive, intentional session prep step.
