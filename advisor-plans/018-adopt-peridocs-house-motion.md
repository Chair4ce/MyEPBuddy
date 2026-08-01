# Plan 018: Adopt PeriDocs house motion system into MyEPBuddy

> **Drift check**: `git diff --stat 71a367e..HEAD -- src/app/globals.css src/components/entries src/components/epb .cursor/rules`
>
> **Source of truth for rules to port** (read-only sibling repo — do not modify PeriDocs):
> `/Users/jacyhoag/Workspace/peridocs/.cursor/rules/motion-*.mdc`
> `/Users/jacyhoag/Workspace/peridocs/lib/motion/{tokens,classes,should-enable-rich-motion}.ts`
> `/Users/jacyhoag/Workspace/peridocs/scripts/check-house-motion.mjs`
> `/Users/jacyhoag/Workspace/peridocs/app/globals.css` (search `--ease-smooth`, `--duration-`, `t-press`, `t-shadow-card`, `t-enter`)

## Status

- **State**: DONE (2026-08-01) — Phase A + B + C shipped
- **Priority**: P1
- **Effort**: L (phased — Phase A+B must ship; Phase C optional in same PR)
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

MyEPBuddy already has partial motion utilities (`t-collapse-grid`, resize tokens, some entrances) and Cursor **user** rules that mirror PeriDocs, but the **repo** lacks:

1. Checked-in `.cursor/rules/motion-*.mdc` for agents/executors
2. Shared `@/lib/motion/classes` helpers (PeriDocs pattern)
3. Canonical CSS variables (`--ease-smooth`, `--duration-fast`, etc.)
4. A `check-house-motion.mjs` lint for AI slop (`ease-in-out`, `duration-300`, `active:scale-95`, `animate-in` abuse)

Result: new UI (Fuse dialog, Impact Booster, stewardship fields) and older EPB/award surfaces keep inventing one-off motion. Porting PeriDocs house motion makes MyEPBuddy feel consistent and stops regressions.

## Current state (MyEPBuddy)

- `src/app/globals.css` has `--resize-ease: cubic-bezier(0.22, 1, 0.36, 1)`, `.t-collapse-grid`, various keyframes — **not** the full PeriDocs token set.
- `.cursor/rules/` only has `supabase-local-instance.mdc` — **no** motion rules in-repo.
- Widespread one-offs: `rg -n "ease-in-out|duration-300|transition-all|active:scale-95|animate-in" src/components --glob '*.tsx' | head`
- Existing good pattern to keep: `.t-collapse-grid` + reduced-motion guard (~358+ in `globals.css`).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Motion check | `node scripts/check-house-motion.mjs` | exit 0 (warnings OK if script warns-only; prefer exit 1 on hits in scoped paths once Phase B done) |
| Tests | `npm test -- src/lib/motion` | pass if tests added |

## Scope

**In scope**:
- `.cursor/rules/motion-*.mdc` — adapt from PeriDocs (7 files); set `alwaysApply` / globs appropriately for this repo (`**/*.{tsx,css}`)
- `src/app/globals.css` — add house CSS variables + core `t-*` utilities (`t-press`, enter, shadow card/elevated, overlay) **without** deleting MyEPBuddy brand colors
- `src/lib/motion/tokens.ts`, `classes.ts`, `should-enable-rich-motion.ts` — slim port (skip PeriDocs marketing/figma/job-specific modules)
- `scripts/check-house-motion.mjs` — adapted ignore list for MyEPBuddy (`src/components/ui/` shadcn exceptions as needed)
- Migrate **pilot surfaces** only in Phase B:
  - `src/components/entries/fuse-to-epb-dialog.tsx`
  - `src/components/entries/fuse-to-epb-bar.tsx`
  - `src/components/entries/stewardship-impact-fields.tsx`
  - `src/components/epb/impact-booster-panel.tsx`
- Optional Phase C: `duty-description-card.tsx` revise panel entrances (known `ease-in-out` / `animate-in`)

**Out of scope**:
- Full-repo rewrite of all `animate-in` / award/decoration/team pages (follow-up plan)
- Copying PeriDocs marketing/WebGL/`motionMarketing*` 
- Changing product layout or colors to match PeriDocs branding
- Physics drag helpers unless a MyEPBuddy slider already needs them (`word-replacement-slider` may use a light subset — only if already draggable)
- **EPB MPA split view and sentence drag-and-drop** — sacred (see `advisor-plans/README.md`). Do not restyle, remotion, or refactor `SentenceDropOverlay`, sentence DnD sensors/handlers, or split-view layout in `mpa-section-card.tsx`. Impact Booster / pressable CTAs only if they sit outside those subtrees; if unclear, skip `mpa-section-card` entirely for motion migration.

## Git workflow

- Branch: `advisor/018-house-motion`
- Prefer 2 commits: (1) tokens+rules+script (2) pilot UI migration
- Do not push unless asked

## Steps

### Step 1: Port Cursor rules

Copy and adapt these files into `myepbuddy/.cursor/rules/`:

- `motion-a11y-perf.mdc`
- `motion-easing-tokens.mdc`
- `motion-entrances-tactile.mdc`
- `motion-reveal-height.mdc`
- `motion-shadows.mdc`
- `motion-physics-snap.mdc`
- `motion-consistency.mdc` (alwaysApply: true; point helpers at `@/lib/motion/classes`)

Rewrite PeriDocs-specific paths (`components/`, marketing, Figma) to MyEPBuddy paths (`src/components/`, `src/app/globals.css`). Keep house curves identical:

| Name | Curve |
|------|-------|
| smooth | `cubic-bezier(0.22, 1, 0.36, 1)` |
| out | `cubic-bezier(0.16, 1, 0.3, 1)` |
| spring | `cubic-bezier(0.34, 1.45, 0.64, 1)` |
| in-out close | `cubic-bezier(0.4, 0, 0.2, 1)` |

Durations: fast 150 / normal 200 / slow 280. Press scale **0.98** (MyEPBuddy user rule) — PeriDocs uses 0.99 in tokens; **use 0.98** for MyEPBuddy to match existing product rule `active:scale-[0.98]`.

**Verify**: `ls .cursor/rules/motion-*.mdc | wc -l` → 7

### Step 2: CSS tokens + utilities in `globals.css`

Under `:root` (and dark if needed), add:

```css
--ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.45, 0.64, 1);
--ease-close: cubic-bezier(0.4, 0, 0.2, 1);
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 280ms;
--reveal-rise: 6px;
--reveal-blur: 2px;
--reveal-dur: var(--duration-slow);
```

Add utilities (names aligned with PeriDocs where practical):

- `.t-press` → `active:scale-[0.98]` + transform transition; reduced-motion: none
- `.t-enter` / blur-rise entrance + reduced-motion collapse
- `.t-shadow-card` / `.t-shadow-elevated` using layered light shadows (see PeriDocs `motion-shadows.mdc` — hairline ring `0 0 0 0.5px`, stacked low-opacity blurs)
- Keep existing `.t-collapse-grid` but ensure it uses `var(--ease-smooth)` / `var(--duration-normal)` instead of hard-coded 0.22s if easy

**Verify**: App still loads; no visual break on `/entries` and `/epb`.

### Step 3: `src/lib/motion/*`

Create slim modules:

- `tokens.ts` — export ease/duration constants mirroring CSS
- `classes.ts` — export at least: `motionPressable`, `motionTransitionInteractive`, `motionEnter`, `motionEnterDurNormal`, `motionCollapseGrid`, `motionSurfaceCard`, `motionListRow` (compose with `cn`)
- `should-enable-rich-motion.ts` — `prefers-reduced-motion` + optional coarse pointer gate (port logic, drop WebGL)

Add `src/lib/__tests__/motion-tokens.test.ts` asserting token values match the house table.

**Verify**: `npm test -- src/lib/__tests__/motion` → pass; `tsc` → 0

### Step 4: `scripts/check-house-motion.mjs`

Port PeriDocs script; scan `src/components` + `src/app` (exclude `src/components/ui` shadcn primitives initially via IGNORE_GLOBS). Patterns to flag:

- `ease-in-out` / `duration-300 ease`
- `transition-all duration-200` / `300`
- `active:scale-95`
- Prefer warning on `animate-in` in feature code (allow in `components/ui`)

Wire optional npm script `"motion:check": "node scripts/check-house-motion.mjs"`.

**Verify**: Script runs; pilot files from Step 5 are clean.

### Step 5: Pilot migration (feature UI)

Update Fuse bar/dialog, stewardship fields, Impact Booster panel:

- Buttons: `cn(motionPressable, …)` instead of ad-hoc `active:scale-[0.98]`
- Transitions: house duration/ease vars — no `ease-in-out`
- Entrances: `motionEnter` (+ duration) instead of `animate-in fade-in-0` where straightforward
- Elevated panels: `motionSurfaceCard` / hairline shadow token where a card chrome already exists — do not invent new card chrome

Honor reduced motion (utilities must no-op).

**Verify**:

```bash
node scripts/check-house-motion.mjs
# pilot paths report 0 hits
npx tsc --noEmit -p tsconfig.json
```

Manual: `/entries` Fuse dialog open/close + Generate button press feel; `/epb` Impact Booster expand uses grid collapse (existing `t-collapse-grid` OK).

## Test plan

- Unit: token constants match documented curves/durations
- Manual: `prefers-reduced-motion: reduce` in DevTools → no stuck transforms on pilot UI
- React Doctor optional: `npx react-doctor@latest --verbose --scope changed` after pilot — triage new findings only

## Done criteria

- [x] 7 motion rules in `.cursor/rules/`
- [x] CSS vars + `t-press` / enter / shadow utilities present with reduced-motion guards
- [x] `@/lib/motion/classes` imported by pilot components
- [x] `scripts/check-house-motion.mjs` exists; pilot paths clean
- [x] `tsc` + new unit tests pass
- [x] README 018 → DONE

## Execution notes (2026-08-01)

- **Press scale is 0.98**, driven by `--press-scale` in `src/app/globals.css`; `motion-tokens.test.ts` asserts it never drifts back to PeriDocs' 0.99.
- **Cascade fix vs. the PeriDocs original**: MyEPBuddy's `t-*` utilities are unlayered (matching the existing `t-collapse-grid` / `t-resize` convention), so a shorthand `transition` on `.t-press` would have silently overridden any Tailwind `transition-*` on the same element. `.t-press` therefore declares only the `:active` transform; timing lives in the `motionPressable` class string. `motionPressOnly` exists for shadcn `<Button>`, whose base variant already carries `transition-all` — composing the full helper there would let `cn()` drop the button's hover transition.
- **Checker is incremental**: `ENFORCED_PATHS` (exit 1) currently holds only the four Phase B pilots; everything else reports as advisory backlog and exits 0. `--strict` fails on any hit. `src/components/ui/`, `mpa-section-card.tsx`, and `sentence-drop-overlay.tsx` are ignored outright.
- **Sacred surfaces untouched**: no edit to `mpa-section-card.tsx`, `SentenceDropOverlay`, DnD sensors, split-view layout, or the `animate-elevator-*` / `epb-t-resize` timings.
- Phase C migrated only the revise-panel subtree of `duty-description-card.tsx`; the card's own `transition-all duration-300 ease-in-out` was left alone because tailwind-merge already lets the zen-mode `transition-[filter,opacity]` class win, and swapping it risks the zen blur.

## STOP conditions

- PeriDocs path missing on the executor machine — STOP; ask operator for a tarball/path of the 7 mdc files + `lib/motion/{tokens,classes}.ts` excerpts.
- Migrating pilot UI would require rewriting Radix Dialog animations end-to-end — leave Dialog chrome alone; only migrate inner feature classes.
- Conflict with existing `t-digit` / `animate-thinking-shimmer` — **keep** those MyEPBuddy-specific utilities; do not replace with PeriDocs thinking helpers.
- Any step would change EPB **split view** or **sentence drag-and-drop** behavior/layout/motion — STOP; leave `mpa-section-card` DnD/split alone and finish pilots on Fuse / stewardship / Impact Booster panel only.

## Maintenance notes

- Follow-up (not this plan): award/decoration/team pages via same checker.
- Reviewers: ensure no purple/glow marketing aesthetic from PeriDocs marketing modules was copied.
- State-driven design (idle/hover/pressed/loading) still applies — motion helpers support it, they don’t replace state enumeration.
