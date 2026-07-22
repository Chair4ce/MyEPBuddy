# Plan 013: Truncate untrusted prompt blocks before assembly (preserve delimiters)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/lib/feedback-talking-points.ts src/lib/__tests__/feedback-talking-points.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 012 soft (tests help); can run after 012
- **Category**: security
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

`buildTalkingPointsUserPrompt` wraps expectations/EPB in delimiter fences, then if the **whole** prompt exceeds `PROMPT_CHAR_BUDGET` it runs `truncatePromptText` on the assembled string. Head/tail truncation can **slice through** `<<<EXPECTATIONS>>>` / `<<<END EXPECTATIONS>>>` (and EPB fences), defeating isolation of untrusted user text.

## Current state

- `src/lib/feedback-talking-points.ts`:
  - Expectations already truncated via `truncatePromptText(expectations)` (~322–324) with `EXPECTATIONS_MAX_CHARS` (4000).
  - EPB slices to 800 chars per statement (~347).
  - Final guard (~364–367):

```ts
const prompt = blocks.join("\n\n");
if (prompt.length > PROMPT_CHAR_BUDGET) {
  return truncatePromptText(prompt, PROMPT_CHAR_BUDGET).text;
}
```

- `truncatePromptText` (~107–123): head 70% + marker + tail — unsafe on fenced assemblies.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/lib/feedback-talking-points.ts`
- `src/lib/__tests__/feedback-talking-points.test.ts`

**Out of scope**:
- API route changes
- Changing `PROMPT_CHAR_BUDGET` value unless needed for tests (prefer keep 24000)

## Git workflow

- Commit message example: `Preserve prompt delimiter fences when enforcing talking-points char budget`
- Do NOT push.

## Steps

### Step 1: Remove whole-prompt truncate

Delete the final `truncatePromptText(prompt, PROMPT_CHAR_BUDGET)` on the assembled string.

### Step 2: Budget by shrinking untrusted / bulky blocks

Implement a strategy that **never** cuts inside delimiter markers:

1. Keep structural blocks (phase intent, ratee line, rubric summary, JSON schema instruction) intact.
2. Untrusted content stays inside complete fences.
3. If `blocks.join("\n\n").length > PROMPT_CHAR_BUDGET`, shrink in this order until under budget (or cannot shrink further):
   - Reduce accomplishments serialization (prefer dropping lowest-priority lines: unassessed thin-MPA verbs, then lowestScored, then trim topByMpa lines from the bottom of each MPA list) — may require building accomplishments block as a mutable string or rebuilding via a helper that accepts a “detail level”.
   - Further reduce expectations via `truncatePromptText` with a lower max (already fenced after truncate).
   - Further reduce each EPB excerpt below 800 (still fully fenced).
4. If still over budget after aggressive shrink, drop optional blocks in order: sparse initial accomplishments → lowestScored section → EPB blocks (final only) — but **never** return a prompt with a broken fence. Prefer dropping an entire EPB block over truncating the fence.

Simplest acceptable implementation: extract `buildTalkingPointsUserPrompt` internals so accomplishments/expectations/EPB are built with explicit max sizes; loop decreasing `EXPECTATIONS_MAX_CHARS` and EPB slice and a new `maxEvidenceLines` until under budget; **no** truncate of the joined string.

### Step 3: Tests

Add tests:

1. Huge expectations string → prompt still contains both `<<<EXPECTATIONS>>>` and `<<<END EXPECTATIONS>>>` exactly once each (or at least matched pair), and length ≤ `PROMPT_CHAR_BUDGET`.
2. Many long EPB statements + large summary → prompt length ≤ budget; every `<<<EPB>>>` has a matching `<<<END EPB>>>` (count equal).
3. Existing prompt tests still pass.

**Verify**: `npm test -- src/lib/__tests__/feedback-talking-points.test.ts` → all pass; `npx tsc --noEmit` → exit 0

## Done criteria

- [ ] No `truncatePromptText(prompt, PROMPT_CHAR_BUDGET)` on the full assembled prompt
- [ ] Fence markers never appear partially split
- [ ] Prompt length ≤ `PROMPT_CHAR_BUDGET` for adversarial large inputs covered by tests
- [ ] Tests above pass
- [ ] Only in-scope files modified

## STOP conditions

- Achieving budget without whole-prompt truncate requires changing the public prompt contract in a way that breaks plan 007 product requirements — STOP and report.
- Existing tests assert whole-prompt truncation behavior — update them deliberately; if unclear, STOP.

## Maintenance notes

- Reviewers: grep for `truncatePromptText\\(prompt` — should be gone.
- Future fields: truncate the field, then wrap fences, never truncate after wrap.
