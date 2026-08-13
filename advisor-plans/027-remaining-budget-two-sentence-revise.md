# Plan 027: Pass remaining shared-budget when revising one of two EPB sentences

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b8adb41..HEAD -- src/components/generate/custom-context-workspace.tsx src/components/generate/statement-selection-workspace.tsx src/lib/revise-length-constraint.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (uses `maxCharacters` already accepted by `/api/revise-selection`)
- **Category**: bug
- **Planned at**: commit `b8adb41`, 2026-08-13

## Why this matters

Two EPB sentences **share one 350-character field**. `/epb` revises the joined blob, so the cap applies to the package. The generate workspaces revise **one sentence at a time** and now send `maxCharacters: maxChars` (350) for that single sentence. A 240-char sentence 1 plus a 220-char sentence 2 stays over 350 even if each revise “fits” 350. Pass the **remaining** budget: `maxChars - otherSentence.length` (minus join overhead of 1–2).

## Current state

`src/components/generate/custom-context-workspace.tsx` — revises `currentText` only, full field max:

```1004:1011:src/components/generate/custom-context-workspace.tsx
          fullStatement: currentText,
          selectedText: currentText,
          selectionStart: 0,
          selectionEnd: currentText.length,
          model,
          mode: "general",
          context: `Revise with focus on ${impact === "custom" ? customImpact : impact} impact. Original source: ${originalContext}. ${context || ""}`,
          maxCharacters: maxChars,
```

`src/components/generate/statement-selection-workspace.tsx` — same pattern with HLR branch:

```330:339:src/components/generate/statement-selection-workspace.tsx
        body: JSON.stringify({
          fullStatement: statement,
          selectedText: statement,
          selectionStart: 0,
          selectionEnd: statement.length,
          model,
          mode: "general",
          context: "Rewrite this EPB statement with fresh verbs and improved flow.",
          maxCharacters:
            workspaceState.selectedMPA === "hlr_assessment" ? maxHlrChars : maxChars,
```

Join overhead is already documented in `src/lib/statement-char-enforce.ts` `combineStatementsForDisplay`: `". "` (2 chars) or `" "` (1 char) when the first ends with `.`.

`selectionBudget(hardMax, surroundingLength)` in `src/lib/revise-length-constraint.ts` already subtracts surrounding text. You can either:

1. Pass `fullStatement` = joined two sentences, `selectedText` = the one being revised, with real `selectionStart`/`selectionEnd`, and `maxCharacters` = field max, **or**
2. Keep revising one sentence but set `maxCharacters` to `Math.max(80, fieldMax - other.length - 2)`.

Prefer (1) so the API’s existing surrounding-length math stays the source of truth.

Do **not** change `/epb` `handleReviseStatement` — it already sends the full joined field.

Sacred surface: do not edit `mpa-section-card.tsx` DnD/split.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npx vitest run src/lib/__tests__/revise-length-constraint.test.ts` | all pass |
| Lint | `npx eslint src/components/generate/custom-context-workspace.tsx src/components/generate/statement-selection-workspace.tsx` | 0 errors (pre-existing unused `i` warning in statement-selection is OK) |

## Scope

**In scope**:
- `src/components/generate/custom-context-workspace.tsx`
- `src/components/generate/statement-selection-workspace.tsx`
- Optional tiny helper + test in `src/lib/revise-length-constraint.ts` / its test file for `remainingPackageBudget(fieldMax, otherLength, firstEndsWithPeriod)`

**Out of scope**:
- `src/components/epb/mpa-section-card.tsx`
- Award/decoration revise
- Changing the 350/250 constants

## Git workflow

- Follow-up on the char-limit branch, or `cursor/epb-revise-shared-budget-<suffix>`
- Commit style: imperative, what/why

## Steps

### Step 1: Helper for remaining budget (testable)

In `src/lib/revise-length-constraint.ts`:

```ts
export function remainingSharedStatementBudget(
  fieldMax: number,
  otherStatementLength: number,
  joinChars: 1 | 2 = 2
): number {
  return Math.max(80, fieldMax - Math.max(0, otherStatementLength) - joinChars);
}
```

Test: field 350, other 200, join 2 → 148; other 0 → 350 (or 348 with join — **if other is empty, joinChars must be 0**). Spec: `joinChars = otherStatementLength > 0 ? 2 : 0`.

**Verify**: new unit tests pass.

### Step 2: Wire custom-context workspace

When revising statement 1, `other` = text2; when revising 2, `other` = text1. Pass `maxCharacters: remainingSharedStatementBudget(maxChars, other.length, other ? 2 : 0)`.

If you choose splice approach (1): `fullStatement` = combined display string, selection offsets into that string. Must match `combineStatementsForDisplay` exactly.

**Verify**: `rg -n "maxCharacters" src/components/generate/custom-context-workspace.tsx` → uses remaining budget helper, not raw `maxChars` for a two-statement MPA.

### Step 3: Wire statement-selection workspace

Same remaining budget using `generatedStatement1` / `generatedStatement2`. HLR uses `maxHlrChars` as `fieldMax`.

**Verify**: `rg -n "maxCharacters" src/components/generate/statement-selection-workspace.tsx` → remaining helper.

## Test plan

- Pattern: `src/lib/__tests__/revise-length-constraint.test.ts`
- Cases: other empty (budget = field max); other 200 of 350 (budget ≤ 150); never below 80

## Done criteria

- [ ] Helper tests pass
- [ ] Two-sentence generate workspaces no longer send a full 350 cap for a single sibling sentence when the other sentence is non-empty
- [ ] `/epb` full-blob revise unchanged
- [ ] eslint 0 errors on in-scope TSX
- [ ] `advisor-plans/README.md` row 027 updated

## STOP conditions

- Workspace data model no longer has two texts per MPA — STOP.
- Fix seems to require changing split-view DnD in `mpa-section-card.tsx` — STOP.

## Maintenance notes

- Reviewer: a 90-char sibling must leave ~258 for the revised sentence, not 350.
- `/epb` card already revises the combined string; do not double-subtract there.
