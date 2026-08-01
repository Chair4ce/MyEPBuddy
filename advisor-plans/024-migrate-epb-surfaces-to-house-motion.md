# Plan 024: Migrate the remaining EPB surfaces to house motion and put them under enforcement

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 044b1be..HEAD -- src/components/epb src/lib/motion scripts/check-house-motion.mjs src/app/globals.css`
> If any in-scope file changed since this plan was written, re-run
> `npm run motion:check` and use its **live** line numbers rather than the ones
> quoted below; if a whole file no longer reports hits, skip it and say so.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — visual-only changes, no behavior or data paths
- **Depends on**: none (independent of 021–023)
- **Category**: tech-debt
- **Planned at**: commit `044b1be`, 2026-08-01

## Why this matters

Plan 018 landed the PeriDocs house motion system in this repo — CSS tokens and
`t-*` utilities in `src/app/globals.css`, typed helpers in
`src/lib/motion/classes.ts`, seven `.cursor/rules/motion-*.mdc` rules, and a
checker at `scripts/check-house-motion.mjs` (`npm run motion:check`). Four files
were migrated as pilots and added to the checker's `ENFORCED_PATHS`, where a
regression fails the build.

Everything else — **60 advisory hits across ~40 files** — is still on one-off
Tailwind motion: `ease-in-out`, `transition-all duration-300`, inline
`cubic-bezier(...)`, `animate-in`, and hand-written `active:scale-[0.9x]` at the
wrong press depth. Two consequences:

1. The app visibly mixes two motion languages. The same interaction feels
   different depending on which screen it is on, which is exactly what the house
   system was adopted to end.
2. `ENFORCED_PATHS` has not grown since the pilots, so `npm run motion:check`
   exits 0 on every one of those 60 hits. A checker that always passes stops
   being a gate.

This plan takes the **EPB tranche** — the eight `src/components/epb/*` files with
advisory hits, excluding the operator-locked split view and sentence
drag-and-drop — migrates them, and adds them to `ENFORCED_PATHS`. It is
deliberately one coherent surface rather than all 40 files: a reviewable diff on
screens that get looked at together.

## Current state

Run `npm run motion:check` to see the live list. As of commit `044b1be`, the EPB
hits are:

| File | Line | Hit |
|---|---|---|
| `src/components/epb/duty-description-card.tsx` | 556 | `transition-all duration-*`, `duration-* ease-in-out`, `ease-in-out` |
| `src/components/epb/duty-description-card.tsx` | 647 | `animate-in` |
| `src/components/epb/duty-description-templates-panel.tsx` | 126 | `animate-in` |
| `src/components/epb/epb-progress-card.tsx` | 260 | inline `cubic-bezier` |
| `src/components/epb/loaded-action-card.tsx` | 47 | `transition-all duration-*` |
| `src/components/epb/loaded-action-card.tsx` | 101 | `animate-in` |
| `src/components/epb/mpa-description-editor.tsx` | 158 | `duration-* ease-in-out`, `ease-in-out` |
| `src/components/epb/prompt-settings-modal.tsx` | 625 | `animate-in` |
| `src/components/epb/section-collaboration-dialog.tsx` | 272 | `animate-in` |
| `src/components/epb/word-replacement-slider.tsx` | 78 | hand-written `active:scale-[0.9x]` |
| `src/components/epb/word-replacement-slider.tsx` | 79 | inline `cubic-bezier` |

Note the checker reports **one line per file per pattern label** — it dedupes.
After you fix the reported line, re-run the check; a second occurrence of the
same pattern in the same file will then surface. Keep iterating until the file
is clean.

### The checker (`scripts/check-house-motion.mjs`)

```js
/** Already on the house system — a hit here is a regression, not backlog. */
const ENFORCED_PATHS = [
  "src/components/entries/fuse-to-epb-bar.tsx",
  "src/components/entries/fuse-to-epb-dialog.tsx",
  "src/components/entries/stewardship-impact-fields.tsx",
  "src/components/epb/impact-booster-panel.tsx",
];
```

and the surfaces it refuses to scan at all:

```js
/** shadcn primitives keep their vendored Radix animations until migrated. */
const IGNORE_PATHS = [
  "src/components/ui/",
  // Sacred: EPB split view + sentence drag-and-drop keep bespoke motion.
  "src/components/epb/mpa-section-card.tsx",
  "src/components/epb/sentence-drop-overlay.tsx",
];
```

### The helpers (`src/lib/motion/classes.ts`)

Import from `@/lib/motion/classes` and compose with `cn()`. The full export list:

`motionPressable`, `motionPressOnly`, `motionTransitionInteractive`,
`motionTransitionColors`, `motionSurfaceCard`, `motionSurfaceElevated`,
`motionListRow`, `motionChip`, `motionInputFocus`, `motionChevronOpen`,
`motionCollapseGrid`, `motionProgressIndicator`, `motionLinkHover`,
`motionEnter`, `motionEnterFade`, `motionEnterFromTop`, `motionEnterFromRight`,
`motionEnterFromLeft`, `motionEnterFromBottom`, `motionEnterZoom`,
`motionEnterZoomSm`, `motionEnterDurFast`, `motionEnterDurNormal`,
`motionEnterDurSlow`, `motionEnterDurList`.

Two definitions worth reading before you start, because they encode a trap:

```ts
export const motionPressable =
  "t-press transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/**
 * Press transform with no transition of its own — for elements that already
 * declare one, notably shadcn `<Button>` (its base variant carries
 * `transition-all`). Adding `motionPressable` there would let `cn()` drop the
 * button's own transition and kill its hover tint.
 */
export const motionPressOnly = "t-press";
```

### Migrated exemplar to copy

`src/components/entries/fuse-to-epb-bar.tsx:9-12,48-50`:

```tsx
import {
  motionEnter,
  motionEnterDurNormal,
  motionPressOnly,
  motionSurfaceElevated,
} from "@/lib/motion/classes";
...
        className={cn(
          motionSurfaceElevated,
          motionEnter,
          motionEnterDurNormal
        )}
```

and `src/components/entries/stewardship-impact-fields.tsx:13,123` for
`motionChip` on a filter pill.

### Mapping table — use this, do not improvise

| Existing pattern | Replace with |
|---|---|
| `active:scale-95`, `active:scale-100`, `active:scale-[0.9x]` on a plain element | `motionPressable` |
| the same on a shadcn `<Button>` (or anything already carrying `transition-all`) | `motionPressOnly` |
| `transition-all duration-150\|200\|300` on an interactive surface | `motionTransitionInteractive` |
| a hover tint / active tab with no transform | `motionTransitionColors` |
| `animate-in fade-in slide-in-from-bottom-*` | `cn(motionEnter, motionEnterDurNormal)` |
| `animate-in fade-in` only (status text) | `motionEnterFade` |
| `animate-in ... slide-in-from-top-*` | `motionEnterFromTop` |
| `animate-in zoom-in-*` on a checkmark | `cn(motionEnterZoom, motionEnterDurNormal)` |
| `animate-in zoom-in-*` on a small icon | `cn(motionEnterZoomSm, motionEnterDurSlow)` |
| `ease-[cubic-bezier(0.22,1,0.36,1)]` | `ease-[var(--ease-smooth)]` |
| `ease-[cubic-bezier(0.16,1,0.3,1)]` | `ease-[var(--ease-out)]` |
| `ease-[cubic-bezier(0.34,1.45,0.64,1)]` | `ease-[var(--ease-spring)]` |
| `ease-in-out` / `ease-[cubic-bezier(0.4,0,0.2,1)]` | `ease-[var(--ease-close)]` |
| `duration-150` / `200` / `300` alongside a token curve | `duration-[var(--duration-fast)]` / `-normal` / `-slow` |

If a curve in the code is not in this table, check
`src/lib/motion/tokens.ts` and `src/app/globals.css` for a matching `--ease-*`
variable. Do **not** invent a new token, and do **not** keep the inline curve.

### Product constraints (from `.cursor/rules/motion-consistency.mdc`)

- MyEPBuddy press scale is **0.98** (`t-press`). Never `0.99` (that is PeriDocs),
  never `0.95`.
- Keep, do not replace: `t-collapse-grid`, `t-resize`, `epb-t-resize`,
  `animate-elevator-*`, `animate-pulse-highlight`.
- Every animation must collapse under `prefers-reduced-motion`. The helpers
  already carry `motion-reduce:transition-none` / `motion-reduce:animate-none`
  — that is one more reason to use them instead of hand-written classes.

## Commands you will need

| Purpose      | Command                                          | Expected on success |
|--------------|--------------------------------------------------|---------------------|
| Motion check | `npm run motion:check`                            | exit 0              |
| Scoped check | `npm run motion:check -- src/components/epb`      | exit 0              |
| Strict check | `node scripts/check-house-motion.mjs --strict src/components/epb` | exit 0 once the tranche is clean |
| Typecheck    | `npx tsc --noEmit`                                | exit 0              |
| Tests        | `npm test`                                        | exit 0 (see STOP note) |
| Lint         | `npm run lint`                                    | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/components/epb/duty-description-card.tsx`
- `src/components/epb/duty-description-templates-panel.tsx`
- `src/components/epb/epb-progress-card.tsx`
- `src/components/epb/loaded-action-card.tsx`
- `src/components/epb/mpa-description-editor.tsx`
- `src/components/epb/prompt-settings-modal.tsx`
- `src/components/epb/section-collaboration-dialog.tsx`
- `src/components/epb/word-replacement-slider.tsx`
- `scripts/check-house-motion.mjs` — the `ENFORCED_PATHS` array only
- `advisor-plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- ⛔ **`src/components/epb/mpa-section-card.tsx` and
  `src/components/epb/sentence-drop-overlay.tsx`** — operator-locked. The EPB
  MPA split view and sentence drag-and-drop keep bespoke motion. They are
  already in the checker's `IGNORE_PATHS`; leave that list exactly as it is. Do
  not open these files, do not "clean up" nearby code, do not touch
  `@dnd-kit` sensors or sentence reorder state. If a change appears to require
  them, STOP.
- `src/components/ui/**` — shadcn primitives keep their vendored Radix
  `data-[state]` animations until migrated deliberately.
- The other ~30 files with advisory hits (award, decoration, team, onboarding,
  billing, library, dashboard, admin). They are the next tranches, not this one.
- `src/app/globals.css` and `src/lib/motion/*` — the token layer is complete.
  If you find yourself needing a new token, that is a STOP condition.
- Any layout, spacing, color, copy, or logic change. This is a motion-only
  migration; the diff should read as class swaps.
- The uncommitted working-tree files (`src/app/(app)/entries/page.tsx`,
  `src/components/entries/entry-card.tsx`,
  `src/components/entries/assessment-detail-dialog.tsx`,
  `src/components/ui/hide-on-scroll.tsx`). Someone else's in-progress work.

## Git workflow

- Branch: `advisor/024-epb-house-motion`
- Commit style matches `git log`: one imperative sentence ending in a period,
  e.g. `Move EPB cards and dialogs onto the house motion helpers.`
- Commit per file or per small group so a visual regression can be bisected.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Snapshot the baseline

```bash
npm run motion:check | tee /tmp/motion-before.txt
npm run motion:check | grep -c ' — '
```

**Verify**: the command exits 0, prints an advisory list, and the count is
around 60. Record the exact number — you will compare against it in step 5.

### Step 2: Migrate the EPB files one at a time

For each of the eight in-scope files, in the order listed in Scope:

1. Open the reported line and read the surrounding element to decide which
   helper applies (use the mapping table above — the choice depends on whether
   the element already declares its own transition).
2. Add the import: `import { ... } from "@/lib/motion/classes";` (or extend an
   existing import from that module).
3. Compose with `cn()` alongside the layout/state classes already on the
   element. Remove the replaced motion utilities — do not leave both.
4. Re-run the scoped check for just that file:
   `node scripts/check-house-motion.mjs --strict src/components/epb/<file>.tsx`

**Verify** after each file: that scoped `--strict` run exits 0 for the file. If
it reports a *new* line (the dedupe effect described in Current state), fix that
one too and re-run until clean.

Also run `npx tsc --noEmit` after each file — a missing import surfaces there.

### Step 3: Sanity-check the reduced-motion path

For each element you changed to an entrance helper, confirm the helper you used
carries a `motion-reduce:` variant (open `src/lib/motion/classes.ts` and check
the exported string). Every export in that module already does. If you wrote a
raw `t-*` class directly instead of importing a helper, add the matching
`motion-reduce:animate-none` / `motion-reduce:transition-none` yourself — or
better, switch to the helper.

**Verify**: `rg -n "t-enter|t-press" src/components/epb/*.tsx | rg -v "motion/classes"`
returns no matches in the eight in-scope files (i.e. every `t-*` usage comes
through a helper import, not a hand-written class).

### Step 4: Put the tranche under enforcement

In `scripts/check-house-motion.mjs`, extend `ENFORCED_PATHS` with the eight
files, keeping the existing four and the array's alphabetical-ish grouping:

```js
const ENFORCED_PATHS = [
  "src/components/entries/fuse-to-epb-bar.tsx",
  "src/components/entries/fuse-to-epb-dialog.tsx",
  "src/components/entries/stewardship-impact-fields.tsx",
  "src/components/epb/duty-description-card.tsx",
  "src/components/epb/duty-description-templates-panel.tsx",
  "src/components/epb/epb-progress-card.tsx",
  "src/components/epb/impact-booster-panel.tsx",
  "src/components/epb/loaded-action-card.tsx",
  "src/components/epb/mpa-description-editor.tsx",
  "src/components/epb/prompt-settings-modal.tsx",
  "src/components/epb/section-collaboration-dialog.tsx",
  "src/components/epb/word-replacement-slider.tsx",
];
```

Do not touch `IGNORE_PATHS`, `PATTERNS`, or `SCAN_ROOTS`.

**Verify**: `npm run motion:check` → exit 0, and the output does **not** contain
"regression(s) on house-motion surfaces". A non-zero exit here means one of the
eight files still has a hit — go back to step 2.

### Step 5: Confirm the backlog shrank and nothing else moved

```bash
npm run motion:check | grep -c ' — '
```

**Verify**: the count dropped by roughly 11 versus step 1 (the exact delta
depends on how many second occurrences the dedupe was hiding — a *larger* drop
is fine, a smaller one means a file was missed). Then:

- `rg -n "src/components/epb/" /tmp/motion-before.txt` lists the old EPB hits;
  `npm run motion:check | rg "src/components/epb/"` must return **nothing**.
- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm test` → exit 0 (see STOP conditions)
- `git status` → only the eight components, the checker script, and
  `advisor-plans/README.md` modified (plus the pre-existing dirty files you did
  not touch).

### Step 6: Visual smoke

If a dev environment is available (`npm run dev`), open `/epb` and exercise:
duty description card (expand/collapse and the revise panel), the templates
panel, the progress card, a loaded action card, the MPA description editor, the
prompt settings modal, the section collaboration dialog, and the word
replacement slider.

**Expected**: entrances fade + rise + clear a blur; presses feel like a firm
0.98; nothing pops in instantly and nothing overshoots. Then set the OS
"reduce motion" preference and confirm all of it collapses to instant.

**Do not open the MPA split view or drag a sentence as part of "testing" —
those surfaces are locked and unchanged by this plan.** If you happen to observe
a change there, that is a STOP condition.

## Test plan

There is no automated visual test in this repo. The gates are:

- `node scripts/check-house-motion.mjs --strict src/components/epb` → exit 0
  (proves the tranche is clean against every pattern, not just the enforced set).
- `npm run motion:check` → exit 0 with zero `src/components/epb/` lines in the
  advisory output.
- `npx tsc --noEmit`, `npm run lint`, `npm test` all green.
- The step 6 manual smoke, including the reduced-motion pass.

No new unit tests. `src/lib/__tests__/motion-tokens.test.ts` already covers the
token layer, which this plan does not change.

## Done criteria

ALL must hold:

- [ ] `npm run motion:check` exits 0 and its advisory output contains no
      `src/components/epb/` lines
- [ ] `node scripts/check-house-motion.mjs --strict src/components/epb` exits 0
- [ ] `ENFORCED_PATHS` in `scripts/check-house-motion.mjs` contains all eight
      newly migrated files plus the original four
- [ ] `IGNORE_PATHS` is unchanged and still lists `mpa-section-card.tsx` and
      `sentence-drop-overlay.tsx`
- [ ] `git diff --stat` shows **zero** changes to
      `src/components/epb/mpa-section-card.tsx` and
      `src/components/epb/sentence-drop-overlay.tsx`
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `advisor-plans/README.md` row for 024 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- A fix appears to require editing `mpa-section-card.tsx` or
  `sentence-drop-overlay.tsx`, or changing anything about the EPB MPA split
  view or sentence drag-and-drop. **Hard stop — operator lock.**
- A curve or duration in the code has no matching `--ease-*` / `--duration-*`
  token. Do not add a token; report the value and the file.
- Replacing `transition-all` visibly breaks a hover state (this happens when the
  element relied on `transition-all` to animate a property the narrower helper
  does not list). Report the element rather than reverting to `transition-all`.
- `npm test` fails with anything other than the known pre-existing
  `src/lib/__tests__/assessment-coaching.test.ts` failure (addressed by plan 021).
- The advisory count goes **up** after your changes.

## Maintenance notes

- **Reviewer should scrutinize**: `motionPressable` vs `motionPressOnly` on
  shadcn `<Button>` elements. Using `motionPressable` there lets `cn()` drop the
  button's own `transition-all` and silently kills its hover tint — that is the
  single most likely defect in this diff.
- Adding a file to `ENFORCED_PATHS` is the point of the exercise: it converts an
  advisory into a build failure. Every future tranche should end the same way.
- **Remaining backlog after this plan** (~49 hits): award (5 files), decoration
  (4), team (6), onboarding (2), library (2), billing, dashboard, admin,
  generate, layout, modals, and `src/app/(app)/team/page.tsx`. Suggested next
  tranches: award+decoration together, then team, then the long tail.
- The checker only scans `*.tsx` under `src/components` and `src/app`. Raw
  one-off curves written directly in `src/app/globals.css` are invisible to it —
  worth a separate look if CSS motion starts drifting.
- The uncommitted entries work in the tree (`entry-card.tsx`,
  `assessment-detail-dialog.tsx`) already carries hand-written
  `active:scale-[0.9x]` and an inline `cubic-bezier`. When it lands, it should
  get the same treatment and join `ENFORCED_PATHS` — flagged here so it is not
  forgotten, explicitly not fixed by this plan.
