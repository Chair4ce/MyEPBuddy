# Plan 009: Scan talking-points inputs before LLM and stop logging raw model text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/app/api/generate-feedback-talking-points/route.ts src/lib/sensitive-data-scanner.ts src/app/api/generate/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

`POST /api/generate-feedback-talking-points` sends accomplishment details, expectations, and EPB statement text to LLM providers without the sensitive-data scan used by peer routes (`/api/generate`, `/api/assess-accomplishment-preview`). PII/CUI can leave the trust boundary. On parse failure the route also logs the **full raw model response**, which may echo user content into server logs.

## Current state

- Peer pattern — `src/app/api/generate/route.ts` (~433–460):

```ts
const accScan = scanAccomplishmentsForLLM(accomplishments);
if (accScan.blocked) {
  return NextResponse.json(
    { error: "Entry contains sensitive data ..." },
    { status: 400 }
  );
}
const ctxScan = scanTextForLLM(customContext, ...);
const stmtScan = scanTextForLLM(...epbStatements.map((s) => s.statement));
```

- Talking-points route — `src/app/api/generate-feedback-talking-points/route.ts`:
  - Loads accomplishments (~186–220), expectations, optional EPB statements.
  - Calls `generateText` (~412–418) with **no** `scanAccomplishmentsForLLM` / `scanTextForLLM`.
  - On parse failure (~423–425):

```ts
console.error("Failed to parse talking points:", parseError);
console.error("Raw response:", text);
```

- Scanner API — `src/lib/sensitive-data-scanner.ts`:
  - `scanAccomplishmentsForLLM(items)` — details/impact/metrics
  - `scanTextForLLM(...texts)` — free text

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests (smoke) | `npm test -- src/lib/__tests__/sensitive-data-scanner.test.ts` | all pass |

## Scope

**In scope**:
- `src/app/api/generate-feedback-talking-points/route.ts`

**Out of scope**:
- Changing scanner regexes / `sensitive-data-scanner.ts`
- Other LLM routes
- Prompt truncation redesign (plan 013)

## Git workflow

- Stay on current branch (or worktree branch from dispatcher).
- Commit message style: imperative sentence, e.g. `Harden talking-points route with pre-LLM scan and safer parse logs`
- Do NOT push.

## Steps

### Step 1: Import scanners

Add:
```ts
import { scanAccomplishmentsForLLM, scanTextForLLM } from "@/lib/sensitive-data-scanner";
```

**Verify**: file imports resolve; no unused imports after Step 2–3.

### Step 2: Scan before billable usage / generateText

After accomplishments (and EPB statements when loaded) are available, **before** `checkAndTrackUsage` / `generateText` (so blocked requests are not billed):

1. `scanAccomplishmentsForLLM(accomplishments)` — if blocked → `400` with the same user-facing message style as `/api/generate` (sensitive data cannot be sent to AI providers).
2. If `expectations` is a non-empty string → `scanTextForLLM(expectations)` — same 400 pattern for expectations text.
3. If `epbStatements` is present → `scanTextForLLM(...epbStatements.map((s) => s.text))` — same 400 pattern.

Match existing error copy tone from `generate/route.ts` (do not invent new product voice).

**Verify**: `rg -n "scanAccomplishmentsForLLM|scanTextForLLM" src/app/api/generate-feedback-talking-points/route.ts` shows imports + call sites before `generateText`.

### Step 3: Stop logging full raw response

Replace `console.error("Raw response:", text)` with a **non-content** diagnostic, e.g.:
```ts
console.error("Talking points parse failed", {
  feedbackType,
  responseChars: typeof text === "string" ? text.length : 0,
  parseError: parseError instanceof Error ? parseError.message : "unknown",
});
```
Keep the existing `refundAndError` path.

**Verify**: `rg -n "Raw response" src/app/api/generate-feedback-talking-points/route.ts` returns no matches.

### Step 4: Typecheck

**Verify**: `npx tsc --noEmit` → exit 0

## Test plan

- No new unit test required if route has no route-level test harness (none today).
- Manual grep gates above are enough; optional: add a tiny pure helper later — do **not** invent a heavy route mock suite in this plan.

## Done criteria

- [ ] Pre-LLM scans for accomplishments, expectations, and EPB text exist and return 400 when blocked
- [ ] Scans run before `checkAndTrackUsage` / `generateText`
- [ ] No full raw LLM body logged on parse failure
- [ ] `npx tsc --noEmit` exits 0
- [ ] Only in-scope files modified

## STOP conditions

- Drift: excerpts no longer match (route structure changed).
- Scanner APIs renamed or removed.
- Fix appears to require billing/refund redesign beyond moving the scan earlier.

## Maintenance notes

- Any new free-text field added to this prompt must be scanned.
- Reviewers: confirm blocked path does not call `checkAndTrackUsage`.
