# Plan 003: Wire banned-formatting repair into `/api/revise-selection`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/app/api/revise-selection/route.ts src/lib/banned-formatting.ts`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (assumes `src/lib/banned-formatting.ts` already exists from the EPB `w/` guard work)
- **Category**: bug
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

EPB generate paths now flag and repair banned formatting (`w/`, `w/o`, `b/c`, `--`, `;`) that the system prompt already forbids. Selection revise (`/api/revise-selection`) is the path users hit when editing statements in the EPB shell / generate workspace — it still returns raw LLM text with no banned-formatting pass. That reintroduces the same hallucination after a successful generate repair.

## Current state

- `src/lib/banned-formatting.ts` — shared detector + deterministic replace + hard-capped LLM revision (`repairBannedFormatting`, `repairBannedFormattingBatch`, max 2 attempts).
- `src/app/api/generate/route.ts` — calls `repairBannedFormattingBatch` on raw statements before sanitization.
- `src/app/api/generate-slot-statement/route.ts` — calls `repairBannedFormatting` on the single statement.
- `src/app/api/revise-selection/route.ts` — after `generateText`, parses JSON revisions and returns them with **no** banned-formatting repair:

```599:614:src/app/api/revise-selection/route.ts
    // Ensure we have at least one revision and limit to requested count
    if (revisions.length === 0) {
      revisions = [selectedText]; // Return original if nothing generated
    } else {
      revisions = revisions.slice(0, versionCount);
    }

    // Trigger async style processing (fire-and-forget) — skip for default-key users
    if (!usageCheck.usingDefaultKey) {
      triggerStyleProcessing(user.id);
    }

    return cacheBillableJson(billableCtx, {
      revisions,
      original: selectedText,
    }, usageCheck);
```

Convention to match: generate route import + call pattern:

```ts
const { repairBannedFormattingBatch } = await import("@/lib/banned-formatting");
const formattingRepair = await repairBannedFormattingBatch(statements, {
  model: modelProvider as LanguageModel,
  maxAttempts: 2,
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm test -- src/lib/__tests__/banned-formatting.test.ts` | all pass |
| Lint path | `npx eslint src/app/api/revise-selection/route.ts` | exit 0 |

## Scope

**In scope**:
- `src/app/api/revise-selection/route.ts`
- Optionally extend `src/lib/__tests__/banned-formatting.test.ts` only if you add a thin pure helper for mapping revision arrays (prefer calling `repairBannedFormattingBatch` directly — no new helper required).

**Out of scope**:
- Award / decoration revise UI components
- Changing the public response shape beyond an optional `formattingViolations` field (additive only)
- Duty-description special casing beyond applying the same repair (banned `w/` is still wrong there)

## Git workflow

- Branch: `advisor/003-revise-selection-banned-formatting` (or continue on the feature branch if already open)
- Commit message style: imperative, why-focused (e.g. `Repair banned EPB formatting on selection revise`)
- Do NOT push or open a PR unless asked

## Steps

### Step 1: Repair revisions before returning

In `src/app/api/revise-selection/route.ts`, after revisions are sliced to `versionCount` and before style processing / return:

1. Dynamically import `repairBannedFormattingBatch` from `@/lib/banned-formatting`.
2. Call it with `revisions` and `{ model: modelProvider, maxAttempts: 2 }`.
3. Assign `revisions = formattingRepair.statements`.
4. If `formattingRepair.flaggedCount > 0`, `console.warn` with violation labels (same style as generate-slot-statement).
5. Optionally include additive response fields:
   - `formattingViolations` — array of `{ violations, remaining, method, attempts }` for flagged items only

Do **not** charge extra credits for this repair; it reuses the same request’s model provider.

**Verify**: `rg -n "repairBannedFormattingBatch" src/app/api/revise-selection/route.ts` → at least one match near the return path.

### Step 2: Smoke the shared unit tests

**Verify**: `npm test -- src/lib/__tests__/banned-formatting.test.ts` → all pass (confirms the helper API you call still matches).

### Step 3: Manual sanity (no network LLM required for logic)

Paste a revision string containing `w/ 3` through a quick node/vitest assertion if you want a route-level test — optional. Minimum: confirm TypeScript compiles for the file via eslint.

**Verify**: `npx eslint src/app/api/revise-selection/route.ts` → exit 0

## Test plan

- Existing `src/lib/__tests__/banned-formatting.test.ts` remains the contract for repair behavior.
- No new route integration test required unless the repo already has revise-selection route tests (it does not as of this plan).

## Done criteria

- [ ] `repairBannedFormattingBatch` runs on every successful revise-selection response before return
- [ ] `maxAttempts` is `2` (hard-capped inside the helper)
- [ ] `npm test -- src/lib/__tests__/banned-formatting.test.ts` passes
- [ ] No files outside scope modified
- [ ] `advisor-plans/README.md` status row for 003 → DONE

## STOP conditions

- `src/lib/banned-formatting.ts` is missing or no longer exports `repairBannedFormattingBatch`
- Revise-selection response shape is consumed with a strict schema that rejects unknown keys — if so, omit `formattingViolations` from the JSON body and only log
- Duty-description path needs different banned rules (report; do not invent a second ruleset in this plan)

## Maintenance notes

- Any new EPB LLM write path should call `repairBannedFormatting` / `Batch` on raw output before persisting or returning to the client.
- Reviewer: ensure this does not add a credit charge or unbounded retry loop.
