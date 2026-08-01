# Plan 006: Flush Impact Booster drafts when Generate / Revise is clicked

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/components/epb/impact-booster-panel.tsx src/components/epb/mpa-section-card.tsx src/lib/impact-booster.ts`
> If those files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (005 already landed — shared `handleImpactBoosterEnhance`)
- **Category**: dx
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

Impact Booster sits above Generate / Revise and again under results. Unsaved textarea drafts live only in panel React state. If the user fills answers then clicks **Generate Revisions** / **Generate Statements** without **Save details** or **Enhance**, `handleGenerate` / `handleGenerateRevisions` only inject persisted `section.impact_booster` — drafts are silently dropped. That feels broken for a control labeled as applying on the next Generate.

## Current state

- [`src/components/epb/impact-booster-panel.tsx`](src/components/epb/impact-booster-panel.tsx) — draft answers + freeform in local `useState`; `buildNextState()` only runs on Save / Enhance.
- [`src/components/epb/mpa-section-card.tsx`](src/components/epb/mpa-section-card.tsx) — `handleGenerateRevisions` builds context via `buildImpactBoosterContext(section.impact_booster)` only (persisted).
- Generate path in `epb-shell-form.tsx` merges the same persisted booster into `clarifyingContext`.
- Two panel mounts when results are open (`*-pre-*` and `*-post-*` keys) — separate draft states.

## Repo conventions to match

- No `useEffect` (project rule). Prefer imperative flush via ref callback or lifting draft into the store / parent.
- Prefer shadcn + existing libs; do not add a new CSS file.
- Unit-test pure helpers under `src/lib/__tests__/` like `impact-booster.test.ts`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Unit tests | `npx vitest run src/lib/__tests__/impact-booster.test.ts` | all pass |
| Lint panel | `npx eslint src/components/epb/impact-booster-panel.tsx src/components/epb/mpa-section-card.tsx` | exit 0 or only pre-existing |

## Scope

**In scope**

- `src/components/epb/impact-booster-panel.tsx` — expose a stable way to flush drafts (e.g. `onDraftChange` / imperative handle via `useImperativeHandle` + `forwardRef`, or lift draft into parent).
- `src/components/epb/mpa-section-card.tsx` — before `handleGenerate` / `handleGenerateRevisions`, persist flushed drafts then inject context. **Do not touch split view or sentence drag-and-drop** (sacred — `advisor-plans/README.md`).
- Optional tiny helper in `src/lib/impact-booster.ts` if merge logic grows.

**Out of scope**

- Removing the post-results panel (product wants both placements).
- Changing Stripe / billing / migrations.
- Reintroducing the clarifying-questions modal.
- **EPB MPA split view** and **sentence drag-and-drop** (sacred — `advisor-plans/README.md`).

## Steps

1. Choose one approach (recommended): add `onDraftChange?: (partial: ImpactBoosterState) => void` fired whenever draft answers/freeform change (debounced not required — parent holds latest draft overlay). Parent merges `normalizeImpactBooster(section.impact_booster)` with draft overlay when building generate/revise context and optionally autosaves on Generate click.
2. Wire `handleGenerate` and `handleGenerateRevisions` to:
   - build `next = merge(persisted, draftOverlay)`
   - `await onSaveImpactBooster(next)` if draft has content
   - inject `buildImpactBoosterContext(next)` into clarifying context
3. Ensure only one draft overlay per MPA (shared parent state) so pre + post panels stay in sync — pass the same `draftAnswers` / setters into both panels **or** keep draft in parent only.
4. Add 1–2 unit tests for the merge helper if extracted; otherwise a focused comment + manual check list in done criteria.
5. **Verify** vitest + eslint commands above.

## Done criteria

- [ ] Typing in Impact Booster then clicking Generate / Revise (without Save) includes those details in the LLM context
- [ ] Pre-CTA and post-results panels show the same draft text for the same MPA
- [ ] No new `useEffect`
- [ ] Vitest impact-booster tests still pass

## STOP conditions

- If React Compiler / project rules forbid the chosen ref pattern, switch to lifted parent state — do not add `useEffect` to sync.
- If `onSaveImpactBooster` is missing on a code path, skip flush and report — do not invent persistence.
- Diff would touch split-view or sentence DnD code — STOP; keep the change limited to Impact Booster draft flush / generate context.

## Maintenance note

Any new Generate / Revise entry point must call the same flush+inject helper. Keep panel keys stable enough that typing is not wiped mid-keystroke (avoid remounting on every freeform character).
