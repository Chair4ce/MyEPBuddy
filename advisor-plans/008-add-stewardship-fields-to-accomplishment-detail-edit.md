# Plan 008: Add stewardship impact fields to the Accomplishment Detail edit form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/components/dashboard/accomplishment-detail-dialog.tsx src/components/entries/stewardship-impact-fields.tsx src/lib/stewardship-impact.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — additive UI + one extra field on an existing update call; reuses already-tested helpers.
- **Depends on**: none (does not depend on Plan 007)
- **Category**: bug (UX correctness — silent no-op edit)
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

`src/components/dashboard/accomplishment-detail-dialog.tsx` is the team-feed / chain-of-command detail view supervisors use to review and correct a subordinate's accomplishment. Its **view mode** already prefers structured `stewardship_impact` over the legacy free-text `impact` column when both exist (added in this same feature — see lines 601-649). Its **edit mode**, however, still only exposes a single free-text `Impact` textarea and never reads or writes `stewardship_impact` (lines 108-117, 528-540, 240-248).

The result is a silent no-op: for any entry that has stewardship data (which is now the default path for every new entry created via `entry-form-dialog.tsx`), a supervisor who opens this dialog, edits the "Impact" textarea, and saves will see **no visible change** — the view mode re-renders from the untouched `stewardship_impact` object, ignoring the `impact` text they just edited. There is no error, no warning, nothing to tell them the edit was ignored. If the entry has *no* stewardship data yet, editing `impact` here works today, but does not give the supervisor any way to add structured stewardship — they're stuck with the pre-feature free-text-only experience in this specific dialog.

## Current state

- `src/components/entries/stewardship-impact-fields.tsx` — already-built, reusable component + helpers for this exact use case:
  - `emptyStewardshipFormValue()`, `stewardshipFormFromImpact(impact)`, `stewardshipImpactFromForm(form)` — form-value <-> `StewardshipImpact` conversions.
  - `<StewardshipImpactFields value={...} onChange={...} disabled={...} idPrefix={...} />` — the four labeled inputs (Man-hours / Funds / Resources / Mission outcome).
- `src/lib/stewardship-impact.ts` — `hydrateStewardshipImpact(stewardship, legacyImpact)` (fills stewardship from legacy `impact` text when stewardship is empty, so old entries stay editable) and `composeImpactString(stewardship)` (builds the legacy-column text for display/back-compat).
- `src/components/entries/entry-form-dialog.tsx` is the reference implementation already wired correctly — model this plan's changes after it:

```44:57:src/components/entries/entry-form-dialog.tsx
import {
  emptyStewardshipFormValue,
  StewardshipImpactFields,
  stewardshipFormFromImpact,
  stewardshipImpactFromForm,
} from "@/components/entries/stewardship-impact-fields";
import { createClient } from "@/lib/supabase/client";
import { scanForSensitiveData, getScanSummary } from "@/lib/sensitive-data-scanner";
import { handleStaleDeploymentError } from "@/lib/stale-deployment";
import {
  composeImpactString,
  hydrateStewardshipImpact,
} from "@/lib/stewardship-impact";
```

- `accomplishment-detail-dialog.tsx`'s current edit form state and submit handler — this is what needs to change:

```108:117:src/components/dashboard/accomplishment-detail-dialog.tsx
  // Edit form state
  const [editForm, setEditForm] = useState({
    date: "",
    action_verb: "",
    details: "",
    impact: "",
    metrics: "",
    mpa: "",
    tags: "",
  });
```

```220:248:src/components/dashboard/accomplishment-detail-dialog.tsx
  async function handleSubmitEdit() {
    if (!accomplishment) return;

    // Scan for PII, CUI, and classification markings — hard block if found
    const sensitiveMatches = scanForSensitiveData({
      details: editForm.details,
      impact: editForm.impact,
      metrics: editForm.metrics,
    });
    if (sensitiveMatches.length > 0) {
      toast.error(getScanSummary(sensitiveMatches), { duration: 10000 });
      return;
    }
    
    setIsSubmitting(true);
    const tags = editForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const result = await updateAccomplishment(accomplishment.id, {
      date: editForm.date,
      action_verb: editForm.action_verb,
      details: editForm.details,
      impact: editForm.impact,
      metrics: editForm.metrics || null,
      mpa: editForm.mpa,
      tags,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      description scaled below in Step 2...
```

- The two `useEffect` blocks that (re)populate `editForm` (`open`/`accomplishment` change, and the discard-changes handler) — both need the same stewardship hydration added:

```150:166:src/components/dashboard/accomplishment-detail-dialog.tsx
  const handleDiscardChanges = () => {
    setShowDiscardDialog(false);
    setIsEditing(false);
    // Reset form to original values
    if (accomplishment) {
      setEditForm({
        date: accomplishment.date,
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact || "",
        metrics: accomplishment.metrics || "",
        mpa: accomplishment.mpa,
        tags: Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "",
      });
    }
    onOpenChange(false);
  };
```

```184:198:src/components/dashboard/accomplishment-detail-dialog.tsx
  // Reset edit state when accomplishment changes
  useEffect(() => {
    if (accomplishment) {
      setEditForm({
        date: accomplishment.date,
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact || "",
        metrics: accomplishment.metrics || "",
        mpa: accomplishment.mpa,
        tags: Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "",
      });
    }
    setIsEditing(false);
  }, [accomplishment]);
```

- `FeedAccomplishment` type (`src/stores/team-feed-store.ts:5`) — `interface FeedAccomplishment extends Accomplishment`, so it already inherits `stewardship_impact?: StewardshipImpact` from `Accomplishment` (`src/types/database.ts:121`). No type change needed; confirmed in Step 5.

## Repo conventions to match

- **No `useEffect` is a hard project rule.** This file already has two pre-existing `useEffect` calls that this plan touches. Do not add a *third* `useEffect` — extend the existing two in place (add stewardship hydration/reset logic inside their existing bodies) rather than introducing a new effect. Do not attempt to remove the pre-existing effects either; that is a larger refactor out of scope for this plan (flag it as a maintenance note instead, see below).
- Reuse `StewardshipImpactFields` exactly as `entry-form-dialog.tsx` does — same helper functions, same component, `idPrefix="detail-edit-stewardship"` (or similar) to keep DOM ids unique from the create/edit dialog if both could theoretically be mounted at once.
- `hasUnsavedChanges()` (lines 123-135) must be extended to also compare stewardship form state, or supervisors will lose the "discard changes?" confirmation for stewardship-only edits.
- Sensitive-data scan on submit (lines 224-232) must include the four `stewardship_*` keys, matching the pattern in `entry-form-dialog.tsx:399-411`.
- Match existing Tailwind spacing/labels in this file (`space-y-1.5`, `text-xs font-medium text-muted-foreground` for labels) — but `StewardshipImpactFields` already ships its own internal spacing/labels, so just drop it in as a block between the existing "Details" and "Metrics & Tags" rows; do not restyle the component itself.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|---------------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint      | `npx eslint src/components/dashboard/accomplishment-detail-dialog.tsx` | exit 0 |
| Tests     | `npx vitest run src/lib/__tests__/stewardship-impact.test.ts` | all pass (no behavior change expected — this plan doesn't touch the lib, just confirms nothing else broke) |

There is no component-level test harness for this file today (no `accomplishment-detail-dialog.test.tsx` exists) — verify via typecheck/lint plus the manual checklist in "Done criteria".

## Scope

**In scope** (the only files you should modify):
- `src/components/dashboard/accomplishment-detail-dialog.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/stores/team-feed-store.ts` — `FeedAccomplishment extends Accomplishment` already inherits `stewardship_impact`; no change needed (see Step 5).
- `src/components/entries/stewardship-impact-fields.tsx`, `src/lib/stewardship-impact.ts` — reuse as-is, no changes needed.
- `src/components/entries/entry-form-dialog.tsx` — reference only, do not modify.
- `src/components/team/add-team-accomplishment-dialog.tsx`, `src/components/team/add-project-accomplishment-dialog.tsx` — these bulk-add dialogs were explicitly deferred in the prior improve pass ("Expand team bulk-add dialogs now" — rejected, see `advisor-plans/README.md` Topic D). Do not add stewardship fields there in this plan.
- `src/app/actions/accomplishments.ts` — `updateAccomplishment` already accepts `stewardship_impact` in its `Partial<Accomplishment>` param; no server-action change is needed.
- Any Supabase migration.

## Steps

### Step 1: Add stewardship state to `editForm` and hydrate it correctly

1. Import at the top of `accomplishment-detail-dialog.tsx`:
   ```ts
   import {
     emptyStewardshipFormValue,
     StewardshipImpactFields,
     stewardshipFormFromImpact,
     type StewardshipImpactFormValue,
   } from "@/components/entries/stewardship-impact-fields";
   import { hydrateStewardshipImpact, composeImpactString, stewardshipImpactFromForm } from "@/lib/stewardship-impact";
   ```
   (Note: `stewardshipImpactFromForm` is exported from `stewardship-impact-fields.tsx`, not `stewardship-impact.ts` — check `src/components/entries/stewardship-impact-fields.tsx:31-40` for the exact export location before writing imports; put each import in the file it actually comes from.)
2. Add `stewardship: StewardshipImpactFormValue` to the `editForm` state shape (default `emptyStewardshipFormValue()`).
3. In both places that currently build `editForm` from `accomplishment` (the `useEffect` at line 184 and `handleDiscardChanges` at line 150), replace the flat `impact: accomplishment.impact || ""` line with:
   ```ts
   const stewardship = hydrateStewardshipImpact(
     accomplishment.stewardship_impact,
     accomplishment.impact
   );
   // ...
   impact: accomplishment.impact || "",
   stewardship: stewardshipFormFromImpact(stewardship),
   ```
   Keep the flat `impact` field in state too (still shown to the user, see Step 2) — `hydrateStewardshipImpact` only changes what populates the *stewardship* sub-object; it does not remove the legacy textarea.

**Verify**: `npx tsc --noEmit` → no type errors from the new `stewardship` key on `editForm`.

### Step 2: Render `StewardshipImpactFields` in the edit form

Directly after the "Row 4: Impact - Full Width" block (lines 528-540) and before "Row 5: Metrics & Tags" (line 542), add:

```tsx
<StewardshipImpactFields
  value={editForm.stewardship}
  onChange={(stewardship) => setEditForm({ ...editForm, stewardship })}
  disabled={isSubmitting}
  idPrefix="detail-edit-stewardship"
/>
```

Leave the existing free-text "Impact" textarea in place — it remains useful for entries with no stewardship content, and for anyone who wants a plain-text summary alongside the structured fields (this matches `entry-form-dialog.tsx`, which also composes `impact` from stewardship but keeps `impact` as a real column). Do not remove it.

**Verify**: Visually confirm (or via `rg -n "StewardshipImpactFields" src/components/dashboard/accomplishment-detail-dialog.tsx` → 1 render + 1 import) the four fields render in edit mode below the Impact textarea.

### Step 3: Wire submit to compose and send `stewardship_impact`

In `handleSubmitEdit` (lines 220-248):

1. Extend the sensitive-data scan to include stewardship subfields:
   ```ts
   const sensitiveMatches = scanForSensitiveData({
     details: editForm.details,
     impact: editForm.impact,
     metrics: editForm.metrics,
     stewardship_time: editForm.stewardship.time,
     stewardship_money: editForm.stewardship.money,
     stewardship_resources: editForm.stewardship.resources,
     stewardship_outcome: editForm.stewardship.outcome,
   });
   ```
2. Decide the composed-impact behavior: follow `entry-form-dialog.tsx`'s pattern exactly — if the stewardship fields have any content, `impact` sent to the server should be the composed string (`composeImpactString(stewardshipImpactFromForm(editForm.stewardship))`), overriding whatever free text is in `editForm.impact`, **unless** stewardship is entirely empty, in which case send `editForm.impact` as-is (preserves the legacy-only editing path for entries with no stewardship). Concretely:
   ```ts
   const stewardshipImpact = stewardshipImpactFromForm(editForm.stewardship);
   const composed = composeImpactString(stewardshipImpact);
   const impactToSend = composed ?? editForm.impact;
   ```
3. Update the `updateAccomplishment` call to include `stewardship_impact: stewardshipImpact` and use `impact: impactToSend` instead of `impact: editForm.impact`.
4. Update the `onAccomplishmentUpdated?.(...)` call right after (currently spreads `...editForm`) so it also reflects `stewardship_impact: stewardshipImpact` and `impact: impactToSend` in the optimistic local update, matching what was actually persisted.

**Verify**: `npx tsc --noEmit` → no type errors. Manually confirm `updateAccomplishment`'s param type (`Partial<Omit<Accomplishment, "id" | "created_at" | "updated_at">>` in `src/app/actions/accomplishments.ts:119-121`) accepts `stewardship_impact` without a cast — it already does per `src/types/database.ts:121`.

### Step 4: Extend `hasUnsavedChanges()` for stewardship

In the `hasUnsavedChanges` function (lines 123-135), add a comparison so stewardship-only edits still trigger the discard-changes confirmation:

```ts
const originalStewardship = stewardshipFormFromImpact(
  hydrateStewardshipImpact(accomplishment.stewardship_impact, accomplishment.impact)
);
return (
  // ...existing comparisons...
  JSON.stringify(editForm.stewardship) !== JSON.stringify(originalStewardship)
);
```

(A `JSON.stringify` comparison is acceptable here since `StewardshipImpactFormValue` is a small flat object of 4 string keys — matches the simplicity level of the rest of this function. Do not add a deep-equal dependency for this.)

**Verify**: Manually open the dialog on an entry with existing stewardship data, edit only the "Man-hours" field, click the dialog close (X) — confirm the "Discard unsaved changes?" dialog now appears (it would previously not, since only `impact`/`details`/etc. were compared).

### Step 5: `FeedAccomplishment` type check (informational — no change expected)

`FeedAccomplishment` (`src/stores/team-feed-store.ts:5`) is declared as `interface FeedAccomplishment extends Accomplishment { ... }`, so it already inherits `stewardship_impact?: StewardshipImpact` from `Accomplishment` (`src/types/database.ts:121`) — this is why the view-mode code at line 602 already compiles today. **Do not modify `src/stores/team-feed-store.ts`** — this step only exists so you double-check `npx tsc --noEmit` has no complaints about `accomplishment.stewardship_impact` before moving on; if it does, that means something else has changed since this plan was written, and you should treat it as a STOP condition rather than editing the store type.

**Verify**: `npx tsc --noEmit` → no errors reading `accomplishment.stewardship_impact` anywhere in `accomplishment-detail-dialog.tsx`.

## Test plan

- No new automated test file (no component-test harness exists for this file — see "Commands you will need"). Run `npx vitest run src/lib/__tests__/stewardship-impact.test.ts` to confirm the shared lib helpers this plan reuses are unaffected.
- Manual verification checklist (in a local dev environment, against a **test** accomplishment — not production data):
  1. Open Team Feed (or wherever `AccomplishmentDetailDialog` is mounted) on an entry that already has stewardship fields set (created via the main Entries form). Click Edit. Confirm the four stewardship inputs appear pre-filled with the existing values.
  2. Edit the "Funds" field, save. Reopen the entry (view mode) — confirm the new value now shows in the "Impact & Results" section (previously it would have shown the stale, unedited value).
  3. Open an entry that has **no** stewardship data (legacy `impact` text only). Click Edit. Confirm the stewardship inputs are empty (not silently populated from legacy `impact` — `hydrateStewardshipImpact` only backfills into the `outcome` field, so check that specifically: legacy impact text should appear in the `outcome` stewardship field, per `hydrateStewardshipImpact`'s documented behavior in `src/lib/stewardship-impact.ts:94-103`).
  4. Type a fake SSN (`123-45-6789`) into the "Man-hours" field and click Save — confirm the same "Entry blocked — sensitive data detected" toast fires that already fires for the `details`/`impact`/`metrics` fields.
  5. Edit only a stewardship field (leave everything else untouched) and click the dialog's close button — confirm the "Discard unsaved changes?" prompt appears.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx eslint src/components/dashboard/accomplishment-detail-dialog.tsx` exits 0
- [ ] `npx vitest run src/lib/__tests__/stewardship-impact.test.ts` exits 0 (unaffected, confirms no regression in reused helpers)
- [ ] `rg -n "StewardshipImpactFields" src/components/dashboard/accomplishment-detail-dialog.tsx` shows both the import and one render site
- [ ] All 5 manual verification steps above pass
- [ ] No `useEffect` count increased in this file (`rg -c "useEffect" src/components/dashboard/accomplishment-detail-dialog.tsx` returns the same count as before this plan — 2)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row for 008 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the dialog has drifted since this plan was written).
- `stewardshipImpactFromForm` or `stewardshipFormFromImpact` are not exported the way this plan describes (check `src/components/entries/stewardship-impact-fields.tsx` directly — the plan's line-number references are current as of `e1e258b` but re-verify before importing).
- Adding stewardship state would require a third `useEffect` to make hydration work correctly (it should not — both existing effects already run exactly when `editForm` needs to be rebuilt) — if you find a case where it seems to require one, stop and report instead of adding it.
- `FeedAccomplishment` turns out to require broader changes than adding one optional field (e.g. if it's generated from a Supabase view that doesn't select `stewardship_impact` at the query level) — report the view/query gap rather than widening this plan's scope to fix data-fetching.

## Maintenance notes

- The two pre-existing `useEffect` calls in this file that this plan extends (`open`/`accomplishment` reset, and inside `handleDiscardChanges`) are themselves against the project's "no `useEffect`" rule, but they predate this plan and a full refactor of this dialog's state management is out of scope here — flag it as a candidate for a future dedicated refactor plan, don't fold it into this one.
- If `add-team-accomplishment-dialog.tsx` / `add-project-accomplishment-dialog.tsx` (the bulk-add dialogs, still free-text-only) are ever upgraded to stewardship fields, they should follow the exact same `StewardshipImpactFields` + `stewardshipFormFromImpact`/`stewardshipImpactFromForm` pattern established here and in `entry-form-dialog.tsx` — do not invent a third variant.
- A reviewer should specifically check that `impactToSend` (Step 3) doesn't regress plain free-text editing for entries that have never had stewardship data — the composed-string-overrides-free-text behavior must only kick in when stewardship actually has content.
