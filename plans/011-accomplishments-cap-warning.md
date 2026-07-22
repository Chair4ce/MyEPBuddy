# Plan 011: Surface when talking-points load hits the 200-accomplishment cap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/app/api/generate-feedback-talking-points/route.ts src/components/team/feedback-session-dialog.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (serialize after 009/010 if same files)
- **Category**: correctness
- **Planned at**: commit `e5b4c24`, 2026-07-21

## Why this matters

`loadAccomplishments` uses `.limit(200)` with no signal when more rows exist. Portfolio averages and talking-points drafts silently omit older entries for high-volume ratees. Supervisors need a warning so they know the draft is incomplete.

## Current state

- `src/app/api/generate-feedback-talking-points/route.ts` `loadAccomplishments` (~186–220): `.limit(200)`, returns `{ accomplishments }` only.
- Response already has a `warnings` array for `epb_statements_unavailable` (~351–364) returned to the client (~435+). Confirm response shape includes `warnings` in `cacheBillableJson` payload.
- Client — `src/components/team/feedback-session-dialog.tsx` `executeGenerate` (~338+): reads payload; may ignore `warnings` today.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/app/api/generate-feedback-talking-points/route.ts`
- `src/components/team/feedback-session-dialog.tsx` (toast or inline notice when warning present)

**Out of scope**:
- Raising the limit / pagination
- Changing portfolio math for truncated sets beyond warning
- Other APIs that also `.limit(200)`

## Git workflow

- Commit message example: `Warn when feedback talking-points omit accomplishments past the 200-row cap`
- Do NOT push.

## Steps

### Step 1: Detect cap in loader

Change `loadAccomplishments` to return `{ accomplishments, truncated?: boolean }` (or always `truncated: boolean`).

Detection approach (pick one; prefer A):

**A (preferred):** `.limit(201)` then if `data.length > 200`, set `truncated = true` and `accomplishments = data.slice(0, 200)`.

**B:** Separate `count` query — only if A conflicts with typing; avoid double full fetch.

**Verify**: loader returns truncated flag; still max 200 rows used for portfolio.

### Step 2: Push warning code

Where `warnings` is built, if truncated:
```ts
warnings.push("accomplishments_truncated");
```

Ensure JSON response includes `warnings` (already for EPB).

**Verify**: `rg -n "accomplishments_truncated" src/app/api/generate-feedback-talking-points/route.ts`

### Step 3: Client notice

In `executeGenerate` success path, if `payload.warnings` includes `"accomplishments_truncated"`, show an existing toast pattern (`sonner` / project toast helper — match nearby toasts in this file or team pages). Message (ratee-neutral / supervisor chrome OK):

> Draft used the 200 most recent accomplishments; older entries were omitted.

Do not block generate success.

**Verify**: `rg -n "accomplishments_truncated" src/components/team/feedback-session-dialog.tsx`

### Step 4: Typecheck

**Verify**: `npx tsc --noEmit` → exit 0

## Test plan

- No unit test required for warning string.
- Optional: pure helper test if you extract `const ACCOMPLISHMENTS_FETCH_LIMIT = 200` — not required.

## Done criteria

- [ ] Truncation detected without silently dropping the signal
- [ ] `warnings` includes `accomplishments_truncated` when capped
- [ ] UI surfaces a toast/notice on that warning
- [ ] Portfolio still built from ≤200 rows
- [ ] `npx tsc --noEmit` exits 0
- [ ] Only in-scope files modified

## STOP conditions

- Response shape has no `warnings` field and adding it would break clients — then include `warnings` consistently with EPB path; if EPB path missing too, STOP.
- Dialog was split by plan 014 before this runs — apply Step 3 to the file that owns `executeGenerate`.

## Maintenance notes

- If pagination is added later, remove this warning or redefine it.
- Reviewers: confirm we still do not bill twice / do not fetch unbounded rows.
