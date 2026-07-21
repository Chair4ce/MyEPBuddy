# Plan 008: One-time coaching features intro modal (all users)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b47bdfe..HEAD -- src/components/layout/app-initializer.tsx src/lib/onboarding-flow.ts src/app/api/billing/accept-terms/route.ts src/types/database.ts src/components/modals/onboarding/earn-tokens-intro-step.tsx supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Note**: An earlier draft of this plan gated on managed accounts and used
> filename `008-supervisor-coaching-intro-modal.md`. That draft is superseded
> by this file. Do not implement managed-only eligibility.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (migration + dismiss persistence; UI only otherwise)
- **Depends on**: Soft on **005 + 006 + 007** (copy describes those features — ship **with or immediately after** that wave)
- **Category**: direction
- **Planned at**: commit `b47bdfe`, 2026-07-21
- **Revised**: 2026-07-21 — eligibility = **all users** (post-onboarding)

## Why this matters

Plans 005–007 add cycle quality insights, entry assessment guidance, and feedback-session talking points. Both Airmen (self) and raters (subordinates / managed accounts) benefit, but nothing announces the capabilities. A **one-time presentation modal** after normal onboarding makes the wave discoverable.

## Eligibility (exact — operator clarification)

Show when **all** are true:

1. Client ready + not signing out (same as other post-onboarding modals)
2. Blocking onboarding complete (`useOnboardingStep` → `null`) — do **not** interrupt terms / rank / trial / earn-tokens
3. Authenticated profile present
4. `profiles.coaching_features_intro_seen_at` is `null`

**No team / managed-member / rank gate.** Civilians still see the modal (slides should not claim they have EPB ACA scoring if product hides those tools — phrase as “when applicable for enlisted performance packages” where needed).

**Out of eligibility:**
- Re-show after dismiss (unless a future reset migration NULLs the column)

## Current state

- Host: `src/components/layout/app-initializer.tsx` — `onboardingComplete` then optional `EpbPromptUpdateModal` (L150–152).
- Dismiss pattern: profile timestamp + PATCH (`earn_tokens_intro_seen_at`, `PATCH /api/billing/accept-terms`).
- UI exemplar: `earn-tokens-intro-step.tsx`. Use **Dialog** (dismissible), not the non-escapable onboarding `AlertDialog` chain.
- **Hard constraint**: no new `useEffect` for visibility. Derive from `onboardingComplete` + `seen_at` + optimistic dismiss flag. Slide index via click handlers only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Local migration | Verify myepbuddy stack, then `supabase db push --local` | success |
| Remote (after local) | `supabase db push` | success |
| Lint | `npm run lint` | exit 0 |
| Tests (if helper added) | `npm test -- src/lib/__tests__/coaching-features-intro.test.ts` | all pass |
| Optional | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `supabase/migrations/191_coaching_features_intro_seen.sql` (next free number after `190_…` if 191 taken)
- `src/types/database.ts` — `coaching_features_intro_seen_at: string | null` on `Profile` (+ supabase types if required)
- `src/app/api/billing/accept-terms/route.ts` — PATCH kind `coachingFeaturesIntro`
- `src/lib/coaching-features-intro.ts` (optional but recommended) — `shouldShowCoachingFeaturesIntro`
- `src/lib/__tests__/coaching-features-intro.test.ts` (if helper added)
- `src/components/modals/coaching-features-intro-modal.tsx` (create)
- `src/components/layout/app-initializer.tsx` — mount + dismiss
- `plans/README.md` status row
- Delete obsolete draft `plans/008-supervisor-coaching-intro-modal.md` if it still exists in the tree

**Out of scope**:
- Managed-only or supervisor-only gates
- Blocking onboarding step machine changes
- Implementing 005/006/007 themselves
- Analytics (skip unless trivial)

## Git workflow

- Branch: `advisor/008-coaching-features-intro-modal`
- Commit example: `Add one-time coaching features intro modal for all users`
- Do NOT push/PR unless asked.

## Design (implement exactly)

### Migration

```sql
-- One-time intro for cycle coaching / feedback features (all users).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coaching_features_intro_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.coaching_features_intro_seen_at IS
  'When the user dismissed the coaching features introduction modal.';
```

Local push first (correct project), then remote.

### Dismiss API

```ts
z.object({
  kind: z.literal("coachingFeaturesIntro"),
  coachingFeaturesIntroSeen: z.literal(true),
})
```

Plus a simple `{ coachingFeaturesIntroSeen: true }` legacy parse if that matches trial/earn style in the same file.

### Modal — 3 slides (dual-audience chrome)

Title: `New coaching tools for stronger EPBs`  
Subtitle: `Whether you are building your own package or helping someone else`

| Slide | Title | Body | Where |
|-------|-------|------|--------|
| 1 | Cycle quality insights | Track MPA coverage **and** quality signals (metrics, impact, miscategorization risk) across the evaluation period — not just entry counts. | Accomplishments → Performance Coverage card (self or selected ratee) |
| 2 | Assess entries & guidance notes | Score an entry against the ACA rubric. Weak indicators become concrete improvement notes — useful for self-edits or feedback to a ratee. | Add/Edit entry → Assess entry |
| 3 | Feedback session talking points | For Initial, Midterm, or Final sessions: draft talking points from expectations + assessed accomplishments. Edit, then share or print. | Team → member → Expectations / Feedback → Generate |

Controls: Back / Next; last slide primary **Got it**; skip/dismiss available every slide (same dismiss handler). Progress dots with `aria-label="Slide n of 3"`.

Copy rules:
- Ratee-neutral where describing the package
- No promotion / stratification promises
- Enlisted/ACA tools: say “for enlisted ACA packages” once in slide 2 if needed so civilians aren’t misled

Sizing/motion: match earn-tokens intro; honor `prefers-reduced-motion`.

### AppInitializer

```tsx
const showCoachingIntro =
  onboardingComplete &&
  !coachingIntroSeenOptimistic &&
  !gateProfile?.coaching_features_intro_seen_at;

{showCoachingIntro && gateProfile && (
  <CoachingFeaturesIntroModal open onDismiss={dismissCoachingIntro} />
)}
```

Optimistic dismiss + PATCH; toast + revert on failure.

Stacking with `EpbPromptUpdateModal`: prefer not hard-blocking; if both fight, defer coaching intro only when EPB prompt is open **if trivial** — otherwise MVP allows rare overlap and notes it.

### Helper (recommended)

```ts
export function shouldShowCoachingFeaturesIntro(args: {
  onboardingComplete: boolean;
  seenAt: string | null | undefined;
  optimisticSeen?: boolean;
}): boolean;
```

Tests: onboarding incomplete → false; complete + null seen → true; seen set → false; optimistic → false.

## Steps

1. Migration + types → local push → verify column  
2. PATCH dismiss  
3. Modal UI (3 slides)  
4. Wire AppInitializer (all users)  
5. Remove obsolete `008-supervisor-coaching-intro-modal.md` if present  
6. README → DONE  

## Done criteria

- [ ] Column `coaching_features_intro_seen_at` live (local, then remote)
- [ ] Every post-onboarding user with null seen_at sees the modal once
- [ ] No managed-member / supervisor-only gate
- [ ] Does not interrupt terms/rank/trial/earn-tokens
- [ ] Slides cover 005/006/007 without strat/promotion claims
- [ ] No new visibility `useEffect`
- [ ] Obsolete managed-only plan file removed if it existed
- [ ] README updated

## STOP conditions

- Migration number collision — use next incremental  
- Wrong supabase project  
- 005–007 missing and copy would lie — delay or strip slides and report  
- Requirement reverts to managed-only — stop; that was explicitly superseded

## Maintenance notes

- Re-announce: NULL column via migration (see `185_reset_earn_tokens_intro_seen.sql`)
- Reviewer focus: all-users eligibility, onboarding non-interference, dismiss durability, dual-audience slide copy
