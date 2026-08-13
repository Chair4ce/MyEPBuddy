# Plan 026: Label EPB vs 1206 in revise-selection system prompt

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b8adb41..HEAD -- src/app/api/revise-selection/route.ts src/lib/__tests__/revise-length-constraint.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (character-cap work already on `cursor/epb-revise-char-limit-43d2`)
- **Category**: bug
- **Planned at**: commit `b8adb41`, 2026-08-13

## Why this matters

`/api/revise-selection` is used for EPB MPA statements **and** AF Form 1206 award bullets. The MPA path still opens with “revise a portion of an award statement (AF Form 1206)”. That fights the new hard 350-character myEval budget (1206 bullets are denser/shorter in a different way) and tells the model the wrong document. Award callers that omit `maxCharacters` should keep 1206 framing; EPB callers that send `maxCharacters` (or a dedicated flag) should get EPB framing.

## Current state

- `src/app/api/revise-selection/route.ts` — `buildStatementPrompt` always says 1206:

```266:268:src/app/api/revise-selection/route.ts
  return `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).

Your task is to revise the selected portion of text while maintaining coherence with the surrounding context.
```

- EPB `/epb` already sends `maxCharacters: 350` (or 250 HLR) from `src/components/epb/epb-shell-form.tsx`.
- Award `src/components/award/award-category-section.tsx` does **not** send `maxCharacters`.
- Duty descriptions already have a separate prompt via `isDutyDescription`.
- Length helpers live in `src/lib/revise-length-constraint.ts`. Do not duplicate length logic here.

Convention: keep award behavior unchanged when the new flag is absent (backward compatible). Match how `isDutyDescription` already forks the prompt.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npx vitest run src/lib/__tests__/revise-length-constraint.test.ts` | all pass |
| Lint | `npx eslint src/app/api/revise-selection/route.ts src/lib/revise-length-constraint.ts` | exit 0 (warnings OK) |

This repo uses `npx vitest run` / `npx eslint` (not `pnpm`). There is no `typecheck` script; do not invent one.

## Scope

**In scope**:
- `src/app/api/revise-selection/route.ts`
- `src/lib/revise-length-constraint.ts` only if you extract a tiny `documentKind` helper (optional; prefer keeping it in the route)
- `src/lib/__tests__/revise-length-constraint.test.ts` or a new `src/lib/__tests__/revise-selection-prompt.test.ts` **only if** you extract `buildStatementPrompt` from the route. If you do not extract it, add a comment-level assertion is not possible — then add a focused extracted function `statementDocumentPreamble(kind)` that the route calls, and unit-test that.

**Out of scope**:
- `src/components/epb/mpa-section-card.tsx` split view / sentence DnD (sacred surface)
- Award 1206 character limits (different product)
- `DEFAULT_EPB_SYSTEM_PROMPT` generate prompt
- Changing `maxCharacters` semantics

## Git workflow

- Stay on the existing feature branch if this is follow-up to the char-limit PR; otherwise `cursor/epb-revise-prompt-kind-<suffix>`
- Commit message style: imperative sentence, what/why. Example: `Fix EPB revise staying over the 350-character cap.`

## Steps

### Step 1: Add a document-kind preamble helper

In `src/lib/revise-length-constraint.ts` (already the revise-prompt helper module) export:

```ts
export type ReviseStatementKind = "epb" | "award";

export function statementRevisePreamble(kind: ReviseStatementKind): string {
  if (kind === "epb") {
    return `You are an expert Air Force writer helping to revise an Enlisted Performance Brief (EPB) performance statement for myEval.\n\nYour task is to revise the selected portion while maintaining coherence with the surrounding context. Two sentences in one field SHARE a single character budget.`;
  }
  return `You are an expert Air Force writer helping to revise a portion of an award statement (AF Form 1206).\n\nYour task is to revise the selected portion of text while maintaining coherence with the surrounding context.`;
}
```

**Verify**: `rg -n "statementRevisePreamble" src/lib/revise-length-constraint.ts` → one export.

### Step 2: Wire kind from the request

In `ReviseSelectionRequest` add optional `statementKind?: "epb" | "award"`. Resolve:

```ts
const statementKind =
  body.statementKind === "epb" || body.statementKind === "award"
    ? body.statementKind
    : isDutyDescription
      ? "award" // unused; duty uses the other builder
      : maxCharacters != null
        ? "epb"
        : "award";
```

Do **not** infer EPB solely from `category` — award categories and MPA keys could collide in theory; `maxCharacters` from EPB callers is the existing signal. Also pass `statementKind: "epb"` from `handleReviseStatement` in `src/components/epb/epb-shell-form.tsx` (explicit is better than infer).

In `buildStatementPrompt`, replace the hardcoded 1206 opener with `statementRevisePreamble(kind)`.

**Verify**: `rg -n "award statement \\(AF Form 1206\\)" src/app/api/revise-selection/route.ts` → only inside `statementRevisePreamble` usage or gone from the route (lives in the helper).

### Step 3: Tests

Add cases in `src/lib/__tests__/revise-length-constraint.test.ts`:

- `statementRevisePreamble("epb")` includes `Enlisted Performance Brief` and does not include `1206`
- `statementRevisePreamble("award")` includes `1206`

**Verify**: `npx vitest run src/lib/__tests__/revise-length-constraint.test.ts` → all pass, including 2 new tests.

## Test plan

- Pattern: `src/lib/__tests__/revise-length-constraint.test.ts`
- Cases: epb preamble, award preamble
- No live LLM calls

## Done criteria

- [ ] `npx vitest run src/lib/__tests__/revise-length-constraint.test.ts` exits 0
- [ ] `npx eslint src/app/api/revise-selection/route.ts src/lib/revise-length-constraint.ts` has 0 errors
- [ ] Award callers that omit `statementKind` and `maxCharacters` still get the 1206 preamble
- [ ] EPB `/epb` revise sends `statementKind: "epb"` **or** is inferred via `maxCharacters`
- [ ] No files outside scope (`git status`)
- [ ] `advisor-plans/README.md` status row for 026 updated

## STOP conditions

- `buildStatementPrompt` no longer contains the 1206 sentence (already extracted by someone else) — rebase onto that instead of duplicating.
- Award product owners want a 1206 character cap in the same PR — STOP; that is a different limit and out of scope.
- Change appears to require editing `mpa-section-card.tsx` split/DnD — STOP.

## Maintenance notes

- Reviewer: confirm award selection-revise still works without new required fields.
- Follow-up: generate-workspace callers can also send `statementKind: "epb"`.
