# Plan 016: Prevent stale project-link setState after async load in entry form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, SKIP updating `plans/README.md` if a
> reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e5b4c24..HEAD -- src/components/entries/entry-form-dialog.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `e5b4c24`, 2026-07-21
- **Revised at**: 2026-07-21 — React Doctor blocked render-time ref mutation; use effect cleanup only
- **Tag**: pre-existing (touched by React Doctor on coaching branch)

## Why this matters

React Doctor warns: `loadExistingProjectLink` awaits Supabase then `setSelectedProjectId` inside a `useEffect` keyed by `editEntry`/`open`. If the user switches entries before the first request finishes, the late response can apply the wrong project link.

**Hard constraints:**

- Do **not** add a new `useEffect`.
- Do **not** mutate a ref during render (e.g. `ref.current = editEntry?.id` on every render). React Doctor flags this as ERROR.
- Fix the existing async path with the effect's `cancelled` cleanup flag only.

## Current state (post-revision target)

- `src/components/entries/entry-form-dialog.tsx` — existing effect with `let cancelled = false` and cleanup `cancelled = true`.
- Async load returns `projectId`; before `setSelectedProjectId`, guard with `if (cancelled) return` only.
- No `currentEditEntryIdRef` or render-phase ref writes.

```tsx
useEffect(() => {
  let cancelled = false;

  if (editEntry) {
    const accomplishmentId = editEntry.id;
    // ... setForm, reset assessment ...
    setSelectedProjectId(null);
    void loadExistingProjectLink(accomplishmentId).then((projectId) => {
      if (cancelled) return;
      setSelectedProjectId(projectId);
    });
  } else {
    // ...
    setSelectedProjectId(null);
  }

  return () => {
    cancelled = true;
  };
}, [editEntry, open]);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| React Doctor | `npm run doctor -- --verbose --scope changed` | no ERROR on ref-during-render |

## Scope

**In scope**:
- `src/components/entries/entry-form-dialog.tsx`

**Out of scope**:
- Removing all `useEffect` from this file (larger refactor)
- Project link schema / RLS changes
- Render-time ref mutation or generation-token refs

## Git workflow

- Commit message: `Fix entry-form project-link race without render-time ref writes`
- Do NOT push.

## Steps

### Step 1: Remove render-time ref mutation

Delete `currentEditEntryIdRef`, its `useRef` import (if unused), and any `ref.current = …` assignment during render.

**Verify**: `rg -n "currentEditEntryIdRef|useRef" src/components/entries/entry-form-dialog.tsx` → no matches (unless another legitimate ref remains).

### Step 2: Keep cancelled-flag guard only

In the **existing** `useEffect`, keep `let cancelled = false` and cleanup `cancelled = true`. Before `setSelectedProjectId` after await, only check `if (cancelled) return`.

Do **not** add a second effect. Do **not** reintroduce render-phase ref mutation.

**Verify**: `rg -n "cancelled" src/components/entries/entry-form-dialog.tsx` shows guard before setState after await.

### Step 3: Confirm no new useEffect

**Verify**: count of `useEffect(` in the file did not increase vs pre-change.

### Step 4: Typecheck

**Verify**: `npx tsc --noEmit` → exit 0

## Test plan

- No automated test required (Supabase client in dialog).
- Manual reasoning: effect cleanup sets `cancelled = true` when `editEntry` or `open` changes, so late fetches skip setState.

## Done criteria

- [ ] Late `loadExistingProjectLink` results cannot overwrite after effect cleanup
- [ ] No render-time ref mutation (React Doctor clean)
- [ ] No additional `useEffect` introduced
- [ ] `npx tsc --noEmit` exits 0
- [ ] Only in-scope files modified

## STOP conditions

- File already has correct cancellation-only pattern with no render ref writes — mark DONE with NOTE, no code change.
- Fix seems to require React Query / new effect-based data library — STOP.
- React Doctor still reports ref-during-render — STOP and remove ref writes; do not add new effects.

## Maintenance notes

- Longer-term: parent passes `initialProjectId` when opening edit to avoid effect fetch entirely.
- Reviewers: ensure cleanup runs on `editEntry` identity change; reject PRs that sync refs during render.
