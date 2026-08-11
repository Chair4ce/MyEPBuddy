# Plan 020: Add EPB voice profile + grounded vocabulary for revise/synonyms

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat eb67d7d..HEAD -- src/app/api/revise-selection src/app/api/synonyms src/components/epb/word-replacement-slider.tsx src/components/epb/prompt-settings-modal.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (ship after edit-persistence perf fixes already on the EPB branch)
- **Category**: direction
- **Planned at**: commit `eb67d7d`, 2026-08-11

## Why this matters

Users report word-replacement feels weak / not "extensive vocabulary," while still requiring zero fabrication. Today's revise path uses aggressiveness + open LLM paraphrase; synonyms are unconstrained LLM lists. Independent tone / brevity / "intelligence" sliders will fight each other and invite fluff. A single **voice profile** (presets + optional fine-tunes) plus a **grounded AF verb lexicon** gives richer wording without inventing facts.

## Current state

- `src/components/epb/word-replacement-slider.tsx` — UI for revise aggressiveness 0–100
- `src/app/api/revise-selection/route.ts` — aggressiveness tiers (~390–430), banned verbs, recommended verbs, factual integrity prompts, temp ~0.7
- `src/app/api/synonyms/route.ts` — open-ended LLM synonym JSON (10–15 strings), no fixed lexicon
- `src/components/epb/prompt-settings-modal.tsx` — existing per-user prompt / style / verbs settings surface — **prefer extending this** over a new settings island
- Repo convention: no new `useEffect` for feature wiring; match existing EPB store patterns in `src/stores/epb-shell-store.ts`

## Recommended product shape (do this, not three free sliders)

1. **Voice profile presets** (one choice): `Crisp` | `Punchy` | `Formal` | `Plain`
   - Maps internally to {brevity, diction, assertiveness} — users never see three competing knobs unless they open "Advanced"
2. **Advanced (optional)**: brevity + diction intensity only (not "intelligence" — that reads as IQ/hallucination bait). Label diction as **Vocabulary range**.
3. **Grounded synonym source**: curated AF / EPB verb+noun lexicon (seed from existing recommended verbs in revise route) with LLM as *ranker among candidates*, not free inventor.
4. Keep **aggressiveness slider** as "how much to change," orthogonal to voice profile.

## Steps

### 1. Extract shared lexicon module

Create `src/lib/epb-vocabulary.ts` exporting:
- `EPB_ACTION_VERBS: string[]` (migrate from revise-selection recommended list)
- `BANNED_EPB_VERBS` (migrate banned list)
- `pickSynonymCandidates(word, { limit })` — dictionary/lookup first; empty → caller may ask LLM with "choose only from this list" empty-fail

Verify: `npx tsc --noEmit` (or project typecheck) includes the new module with 0 errors on it.

### 2. Constrain `/api/synonyms`

Change prompt so the model **only returns substitutes from a provided candidate list** (or returns `[]` if none fit). Reject responses that introduce tokens not in the candidate set.

Verify: add/extend a Vitest test under `src/lib/__tests__/` or route test that filters hallucinated synonyms.

### 3. Wire voice profile into revise prompts

Persist profile on user prefs or EPB config (reuse prompt-settings storage if one exists). Pass profile into `revise-selection` system prompt as a short "VOICE" block (brevity + diction), without raising temperature.

Verify: `npm run test -- revise` or targeted Vitest for prompt builder; manual revise at aggressiveness 50 with Crisp vs Punchy should differ in sentence length, not invent metrics.

### 4. UI

In revise panel / prompt settings: preset segmented control + keep WordReplacementSlider. Do not add a separate "Intelligence" control.

Verify: `npm run motion:check` after UI class changes; `npm run lint` on touched files.

## Out of scope

- Rewriting MPA split-view / sentence DnD (`mpa-section-card.tsx` sacred surfaces)
- Raising LLM temperature to "sound smarter"
- Marketing copy generators outside EPB revise/synonym paths

## STOP conditions

- If prompt-settings persistence is encrypted/user-scoped in a way you cannot extend safely → stop and report; do not stash prefs in localStorage only.
- If synonym candidates cannot be sourced without a new dependency → stop; do not add NLP packages without approval.

## Done criteria

- [ ] Lexicon module exists; revise + synonyms import it
- [ ] Synonym API rejects out-of-lexicon inventions
- [ ] Voice preset affects revise prompt; no "intelligence" slider
- [ ] Tests for synonym filtering pass
- [ ] Lint/motion checks pass on touched UI
