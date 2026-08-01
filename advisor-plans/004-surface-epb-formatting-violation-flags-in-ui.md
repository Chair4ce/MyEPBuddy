# Plan 004: Surface EPB banned-formatting flags in the generate UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/app/api/generate/route.ts src/components/generate src/components/epb`
> If generate UI files changed substantially, re-read how statement results are typed/consumed before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (API already returns `formattingViolations` from `/api/generate`)
- **Category**: dx
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

The generate API now flags when the LLM included banned formatting (`w/`, `;`, etc.) even though the prompt forbids it, and repairs the text before return. Without UI feedback, supervisors cannot tell a statement was auto-corrected for instruction hallucination — useful for trust and for spotting models that repeatedly violate rules.

## Current state

`/api/generate` already attaches optional metadata per MPA result:

```ts
formattingViolations?: Array<{
  violations: string[];
  remaining: string[];
  method: string;
  attempts: number;
}>
```

(See `src/app/api/generate/route.ts` near the `results.push` call.)

Generate UI consumers (find the exact store/component during execution — likely `src/components/generate/statement-selection-workspace.tsx` or the EPB generate flow in `src/components/epb/`) currently ignore unknown result fields.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Find consumer | `rg -n "statements: results|formattingViolations|/api/generate" src/components src/stores` | shows generate result handling |
| Lint | `npx eslint <touched files>` | exit 0 |
| Doctor (if TSX touched) | `npm run doctor -- --verbose --scope changed` | no new error-severity findings |

## Scope

**In scope**:
- The client component(s) / store that consume `/api/generate` MPA results
- Minimal non-blocking UI: a small muted note or badge near the affected statement version(s), e.g. “Auto-fixed banned formatting (w/)”
- Prefer existing shadcn components under `src/components/ui`

**Out of scope**:
- Blocking the user from selecting a repaired statement
- Analytics/telemetry pipelines
- Changing repair logic in `banned-formatting.ts`
- Award / decoration UIs
- **EPB MPA split view** and **sentence drag-and-drop** (sacred — `advisor-plans/README.md`). Surface flags near version pickers / muted helper text only; do not alter DnD overlays or split layout.

## Git workflow

- Branch: `advisor/004-epb-formatting-flags-ui`
- Commit style: imperative, why-focused
- Do NOT push/PR unless asked

## Steps

### Step 1: Trace the generate result type

Find where `/api/generate` JSON is parsed into local state. Extend the TypeScript type for each MPA result with optional `formattingViolations` matching the API shape. Do not make it required.

**Verify**: `rg -n "formattingViolations" src/components src/stores` → type + read site exist.

### Step 2: Render a non-blocking flag

When `formattingViolations?.length` is truthy for an MPA batch, show one compact note (not a card cluster) near that MPA’s generated versions. Copy must:
- Mention auto-fix occurred
- List labels (e.g. `w/`, `;`) from `violations`
- Not use alarmist error styling unless `remaining.length > 0`

Match existing EPB muted helper-text / badge patterns in the parent component.

**Verify**: `npm run doctor -- --verbose --scope changed` if any `.tsx` changed → score does not regress; no new errors.

### Step 3: Accessibility

- Use visible text (not color alone)
- If using a tooltip/badge, ensure keyboard focus and `aria-label`

**Verify**: manual — tab to the flag control if interactive; if static text, confirm it is in the accessibility tree (not `aria-hidden` without an accessible name elsewhere).

## Test plan

- No new unit test required for pure presentational flag unless a pure formatter helper is extracted.
- If a pure `formatFormattingViolationNote(flags)` helper is extracted, unit-test it in `src/lib/__tests__/` or colocated test.

## Done criteria

- [ ] Generate UI shows a note when API returns `formattingViolations`
- [ ] No layout shift on empty (no flags) path — reserve no empty card chrome
- [ ] React Doctor gate passes for changed TSX
- [ ] `advisor-plans/README.md` status row for 004 → DONE

## STOP conditions

- Generate results are not typed in the client (opaque `any`) and wiring requires a large refactor — stop and report the consumer path instead of inventing a parallel state tree
- Design system already has a “QC feedback” surface — reuse it rather than inventing a second banner pattern; if unclear which to reuse, STOP and ask
- Flag UI would require changing split-view structure or sentence DnD — STOP and place the note outside those subtrees (or report)

## Maintenance notes

- Slot-statement API also returns `formattingViolations` / `formattingRemaining` — wire that in a follow-up only if the slot UI is still user-facing.
- Reviewer: ensure we never block selection of a successfully repaired statement.
