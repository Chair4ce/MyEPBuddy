# Plan 007: Cover `stewardship_impact` in the background sensitive-data redaction safety net

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/app/api/scan-entry/route.ts src/app/api/scan-entries-batch/route.ts src/lib/sensitive-data-scanner.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — touches the persistence path for a background job that runs against every accomplishment (single-entry post-save scan + full-table batch scan). Getting the JSONB merge or redaction indices wrong can corrupt `stewardship_impact` or wipe fields that were clean.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

MyEPBuddy is explicitly an UNCLASSIFIED-only system. `scanForSensitiveData` / `getScanSummary` hard-block PII, CUI, and classification markings on save (client `src/components/entries/entry-form-dialog.tsx:399-411` and server `src/app/actions/accomplishments.ts:81-96`), and the AI-assessment routes re-scan before ever sending an accomplishment to an LLM provider (`src/app/api/assess-accomplishment/route.ts:98-116`, `src/app/api/assess-accomplishment-preview/route.ts:167-182`). All of those call sites correctly include the four `stewardship_impact` subfields (`time`, `money`, `resources`, `outcome`) introduced in migration 198.

The **background auto-redaction safety net** — `POST /api/scan-entry` (fires after every create/update, see `src/components/entries/entry-form-dialog.tsx:172-186`) and the maintenance sweep `POST /api/scan-entries-batch` — does not. Both routes only `select("id, user_id, details, impact, metrics")` and only scan/redact those three columns. The `impact` text column happens to contain a *derived copy* of stewardship content (via `composeImpactString`), so a stewardship leak often does get flagged and the `impact` column gets redacted — but the **source-of-truth `stewardship_impact` JSONB column is never touched**. That means:

- The entry's `sensitive_data_flags` / `sensitive_data_scanned_at` say "redacted", giving a false sense that the entry is now clean, while the raw sensitive text still sits in `stewardship_impact`.
- Re-opening the entry to edit re-hydrates the form straight from `stewardship_impact` (`hydrateStewardshipImpact` in `src/lib/stewardship-impact.ts:94-103`, called from `src/components/entries/entry-form-dialog.tsx:296-299`), silently restoring the unredacted text into the UI and into the next save's composed `impact` string.
- The next AI assessment run reads `accomplishment.stewardship_impact` directly (`src/app/api/assess-accomplishment/route.ts:99-101`) and sends the still-unredacted content — the very re-scan there will catch it and *block* the assessment, but the underlying leak in the database remains until a human manually edits it out.

This is a real gap in defense-in-depth for a safety net whose own design intent (per its comment) is "if sensitive data slips past client/server validation, this will auto-redact it."

## Current state

- `src/app/api/scan-entry/route.ts` — single-entry post-save scan, triggered from `entry-form-dialog.tsx` and `accomplishment-detail-dialog.tsx`.

```42:60:src/app/api/scan-entry/route.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entry, error: fetchError } = await (supabase as any)
      .from("accomplishments")
      .select("id, user_id, details, impact, metrics")
      .eq("id", accomplishmentId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { error: "Accomplishment not found" },
        { status: 404 }
      );
    }

    // Scan text fields
    const matches = scanForSensitiveData({
      details: entry.details,
      impact: entry.impact ?? undefined,
      metrics: entry.metrics ?? undefined,
    });
```

- `src/app/api/scan-entries-batch/route.ts` — same pattern, looped over up to 50 un-scanned rows (`select("id, user_id, details, impact, metrics")`, same 3-key `scanForSensitiveData` call, same 3-key redact/update block).
- `src/lib/sensitive-data-scanner.ts` — shared scanner. `scanForSensitiveData` is field-name-agnostic (any key works, see `scanAccomplishmentsForLLM` already passing `stewardship_time`/`stewardship_money`/`stewardship_resources`/`stewardship_outcome`), but `redactSensitiveData` hardcodes which field names it will redact:

```373:390:src/lib/sensitive-data-scanner.ts
export function redactSensitiveData(
  text: string,
  matches: SensitiveMatch[]
): string {
  if (!matches.length) return text;

  // Sort matches by index descending so replacements don't shift positions
  const sorted = [...matches]
    .filter((m) => m.field === "details" || m.field === "impact" || m.field === "metrics")
    .sort((a, b) => b.index - a.index);

  let result = text;
  for (const m of sorted) {
    const tag = `[REDACTED-${m.type.toUpperCase()}]`;
    result = result.substring(0, m.index) + tag + result.substring(m.index + m.value.length);
  }
  return result;
}
```

- `src/lib/stewardship-impact.ts` — `StewardshipImpact = { time?, money?, resources?, outcome? }`, `normalizeStewardshipImpact(raw)` safely coerces DB JSONB into that shape (use this instead of hand-rolling field access on `entry.stewardship_impact`).
- Correct reference pattern already in the codebase — `src/app/actions/accomplishments.ts:80-96` builds the scan input from stewardship subfields:

```80:93:src/app/actions/accomplishments.ts
  const stewardship = data.stewardship_impact ?? {};
  const validation = validateSensitiveData(
    {
      details: data.details,
      impact: data.impact,
      metrics: data.metrics,
      stewardship_time: stewardship.time,
      stewardship_money: stewardship.money,
      stewardship_resources: stewardship.resources,
      stewardship_outcome: stewardship.outcome,
    },
    user.id
  );
```

## Repo conventions to match

- Field names for stewardship scanning are always `stewardship_time`, `stewardship_money`, `stewardship_resources`, `stewardship_outcome` (see `scanAccomplishmentsForLLM` in `src/lib/sensitive-data-scanner.ts:477-507` and both assess routes) — reuse these exact keys so `SensitiveMatch.field` stays consistent across the codebase.
- Always normalize DB JSONB with `normalizeStewardshipImpact` before reading subfields (never destructure `entry.stewardship_impact` directly — it can be `null`/malformed on old rows).
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `(supabase as any)` / `(service as any)` is the existing pattern for typed-Supabase-client gaps in this repo (see both route files) — match it, don't attempt a broader typing fix here.
- Do not add a `useEffect` anywhere (project rule) — these are server route handlers, not components, so this should not come up, but do not introduce a client-side effect to trigger anything new either.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|---------------------------|---------------------|
| Tests     | `npx vitest run src/lib/__tests__/sensitive-data-scanner.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` (project has no dedicated `typecheck` script) | exit 0 |
| Lint      | `npx eslint src/lib/sensitive-data-scanner.ts src/app/api/scan-entry/route.ts src/app/api/scan-entries-batch/route.ts` | exit 0 |

There is no existing API-route test harness in this repo (`src/app/api/**/*.test.ts` — none exist anywhere). Do not invent a new test framework/mocking setup for this plan; verify the route changes by code review + the manual checklist in "Done criteria" instead, and put automated coverage on the shared `sensitive-data-scanner.ts` helper where the repo already has a test file.

## Scope

**In scope** (the only files you should modify):
- `src/lib/sensitive-data-scanner.ts` — broaden `redactSensitiveData`'s field allowlist.
- `src/lib/__tests__/sensitive-data-scanner.test.ts` — add cases for the broadened allowlist.
- `src/app/api/scan-entry/route.ts` — fetch, scan, redact, and persist `stewardship_impact`.
- `src/app/api/scan-entries-batch/route.ts` — same, in the loop.

**Out of scope** (do NOT touch, even though they look related):
- `src/app/actions/accomplishments.ts`, `src/app/api/assess-accomplishment/route.ts`, `src/app/api/assess-accomplishment-preview/route.ts` — these already scan stewardship fields correctly (pre-save block / pre-LLM block). Do not modify their scanning logic.
- `src/components/entries/entry-form-dialog.tsx`, `src/components/dashboard/accomplishment-detail-dialog.tsx` — only the fire-and-forget `fetch("/api/scan-entry", ...)` call sites; they need no changes for this plan.
- `src/lib/stewardship-impact.ts` — do not change field normalization/composition logic.
- Any Supabase migration — the `stewardship_impact` column already exists (migration 198); this plan only changes application code.
- `sensitive_data_audit_log` schema — reuse its existing `matches` / `original_snippets` JSONB columns, do not alter the table.

## Steps

### Step 1: Broaden the redaction allowlist in the shared scanner

In `src/lib/sensitive-data-scanner.ts`, change `redactSensitiveData`'s filter so it also accepts the four stewardship field names (keep `details`/`impact`/`metrics` — other callers still rely on them):

```ts
const REDACTABLE_FIELDS = new Set([
  "details",
  "impact",
  "metrics",
  "stewardship_time",
  "stewardship_money",
  "stewardship_resources",
  "stewardship_outcome",
]);

// ...
const sorted = [...matches]
  .filter((m) => REDACTABLE_FIELDS.has(m.field))
  .sort((a, b) => b.index - a.index);
```

Define `REDACTABLE_FIELDS` once near the top of the file (module scope) so it can be reused if a test wants to assert against it. Keep `redactField`/`scanStatementText`/`scanTextForLLM` untouched — they already call `scanForSensitiveData` with whatever field name is passed in, so they are unaffected by this change as long as that field name is in the new set (add `redactField`'s caller field names to the set too if you introduce any in Step 3/4 — you should not need to; `redactField` is not used by the routes you're changing).

**Verify**: `npx vitest run src/lib/__tests__/sensitive-data-scanner.test.ts` → all existing tests still pass (the allowlist only grew, nothing was removed).

### Step 2: Add a regression test for the broadened allowlist

In `src/lib/__tests__/sensitive-data-scanner.test.ts`, add a test in the existing `describe("Redaction", ...)` block (model after the existing `"redacts SSN with typed tag"` case at line ~587):

```ts
it("redacts matches in stewardship subfields", () => {
  const text = "Saved 40 man-hrs, contact john.doe@example.com for details";
  const matches = scanForSensitiveData({ stewardship_time: text });
  const redacted = redactSensitiveData(text, matches);
  expect(redacted).toContain("[REDACTED-EMAIL]");
  expect(redacted).not.toContain("john.doe@example.com");
});
```

**Verify**: `npx vitest run src/lib/__tests__/sensitive-data-scanner.test.ts` → new test passes alongside the rest.

### Step 3: Extend `src/app/api/scan-entry/route.ts` to cover `stewardship_impact`

1. Add `import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";` and add `stewardship_impact` to the `.select(...)` call:
   ```ts
   .select("id, user_id, details, impact, metrics, stewardship_impact")
   ```
2. Normalize it right after the fetch: `const stewardship = normalizeStewardshipImpact(entry.stewardship_impact);`
3. Extend the `scanForSensitiveData` call to include the four stewardship keys:
   ```ts
   const matches = scanForSensitiveData({
     details: entry.details,
     impact: entry.impact ?? undefined,
     metrics: entry.metrics ?? undefined,
     stewardship_time: stewardship.time,
     stewardship_money: stewardship.money,
     stewardship_resources: stewardship.resources,
     stewardship_outcome: stewardship.outcome,
   });
   ```
4. In the `if (matches.length > 0)` branch, alongside the existing `detailMatches`/`impactMatches`/`metricsMatches`, add per-subfield match filters and build a redacted `stewardship_impact` object (only include keys that had content, mirroring `normalizeStewardshipImpact`'s own shape):
   ```ts
   const stewardshipFieldMap: Record<string, keyof typeof stewardship> = {
     stewardship_time: "time",
     stewardship_money: "money",
     stewardship_resources: "resources",
     stewardship_outcome: "outcome",
   };
   const redactedStewardship = { ...stewardship };
   for (const [field, key] of Object.entries(stewardshipFieldMap)) {
     const fieldMatches = matches.filter((m) => m.field === field);
     const original = stewardship[key];
     if (fieldMatches.length > 0 && original) {
       redactedStewardship[key] = redactSensitiveData(original, fieldMatches);
     }
   }
   ```
5. Include `stewardship_impact: redactedStewardship` in the `.update({...})` call (alongside `details`, `impact`, `metrics`, `sensitive_data_scanned_at`, `sensitive_data_flags`) — but only send it if at least one stewardship field actually changed, to avoid rewriting an unrelated column on every clean save. A simple check: `const stewardshipChanged = Object.entries(stewardshipFieldMap).some(([field]) => matches.some((m) => m.field === field));` then spread `...(stewardshipChanged ? { stewardship_impact: redactedStewardship } : {})` into the update payload.
6. Extend `originalSnippets` the same way the existing `details`/`impact`/`metrics` blocks do, e.g. `if (fieldMatches.length > 0 && original) originalSnippets[field] = original;` inside the loop from step 4 (so the audit log keeps a pre-redaction copy for incident response, matching existing behavior for the other three fields).
7. Extend the `fields` array in the JSON response (`status: "redacted"` payload) to include any stewardship field names that had matches, so callers can see what got touched.

**Verify**: `npx tsc --noEmit` → no new type errors in `src/app/api/scan-entry/route.ts`.

### Step 4: Apply the same change to `src/app/api/scan-entries-batch/route.ts`

Repeat Step 3's logic inside the `for (const entry of entries)` loop:
1. Add `stewardship_impact` to the batch `.select(...)`.
2. Add `import { normalizeStewardshipImpact } from "@/lib/stewardship-impact";`.
3. Normalize + scan + redact using the same helper logic as Step 3 (consider extracting a tiny shared helper function in this route file, e.g. `buildStewardshipRedaction(stewardship, matches)`, and reuse it — do not create a new shared lib file for this; keep it colocated since both routes are small and the logic is ~15 lines).
4. Include the conditional `stewardship_impact` key in this route's `.update({...})` call and extend `originalSnippets` the same way.

**Verify**: `npx tsc --noEmit` → no new type errors in `src/app/api/scan-entries-batch/route.ts`.

### Step 5: Full verification pass

**Verify**: `npx vitest run src/lib/__tests__/sensitive-data-scanner.test.ts` → all pass, including the new Step 2 test.
**Verify**: `npx eslint src/lib/sensitive-data-scanner.ts src/app/api/scan-entry/route.ts src/app/api/scan-entries-batch/route.ts` → exit 0.

## Test plan

- New unit test in `src/lib/__tests__/sensitive-data-scanner.test.ts` (Step 2) — locks in the broadened `redactSensitiveData` allowlist so a future refactor can't silently narrow it back to the original 3 fields.
- No new route-level automated tests (repo has none for `src/app/api/**`) — cover the two route files with the manual checklist below instead.
- Manual verification checklist (perform once locally against the dev Supabase stack — do not run against production data):
  1. Create an accomplishment where the `Man-hours` stewardship field contains an email address (e.g. `"contact test@example.com for hours"`) by calling the create path directly via SQL/`execute_sql` against a **test** row (the UI's own pre-save scan will correctly block this from the form — that's expected and is not a bug to work around).
  2. Call `POST /api/scan-entry` with that row's id.
  3. Confirm the response includes `"stewardship_time"` in `fields`, and that the row's `stewardship_impact.time` in the DB now contains `[REDACTED-EMAIL]` instead of the address.
  4. Confirm `sensitive_data_audit_log` has a new row with `original_snippets.stewardship_time` equal to the original unredacted text.

## Done criteria

Machine-checkable where possible, manual where the repo has no route-test harness. ALL must hold:

- [ ] `npx vitest run src/lib/__tests__/sensitive-data-scanner.test.ts` exits 0, including the new stewardship redaction test
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx eslint src/lib/sensitive-data-scanner.ts src/app/api/scan-entry/route.ts src/app/api/scan-entries-batch/route.ts` exits 0
- [ ] `rg -n "stewardship_impact" src/app/api/scan-entry/route.ts src/app/api/scan-entries-batch/route.ts` shows the column in both the `.select(...)` and the update payload of each file
- [ ] The manual verification checklist above was performed against a local/dev Supabase instance (not production) and produced the expected redacted result
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row for 007 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the routes or scanner have drifted since this plan was written).
- `stewardship_impact` is not present on the `accomplishments` table when you check `list_tables` / `select stewardship_impact from accomplishments limit 1` — that would mean migration 198 was rolled back; do not recreate the column, report instead.
- A step's verification fails twice after a reasonable fix attempt.
- You find that redacting a stewardship subfield would require changing `SensitiveMatch.index` semantics (e.g. because a future change made matches span multiple concatenated fields) — the current design assumes one match's `index` is relative to its own single field's text; if that assumption is false, stop and report rather than guessing at offsets.

## Maintenance notes

- Any *new* free-text-like column added to `accomplishments` in the future (there is a precedent risk here — this is now the second time a new text field was added without updating the background scan) should be added to **both** `scan-entry/route.ts` and `scan-entries-batch/route.ts` in the same PR that adds the column. Consider a follow-up refactor that centralizes "which accomplishment fields are scannable" into one exported list in `sensitive-data-scanner.ts` that all four call sites (`accomplishments.ts`, both assess routes, both scan routes) import from, instead of each call site hand-listing the same four `stewardship_*` keys — that follow-up is explicitly out of scope here to keep this plan's blast radius small, but is worth raising in review.
- A reviewer should double-check that the conditional `stewardship_impact` write (only when something changed) doesn't race with a concurrent user edit to the same row between the fetch and the update — this background job already has that same race for `details`/`impact`/`metrics` today (pre-existing, not introduced by this plan), so match the existing risk posture rather than trying to fix optimistic-concurrency here.
