# 025 — Bulk paste → Generate EPB follow-ups

## Context

Feature landed (HEAD `af06d76` + uncommitted): New Entry split → Bulk paste → `POST /api/extract-accomplishments` → review/combine → batch `createAccomplishment` → optional **Save & open Generate EPB** with `preselected` override.

## Still open (executor handoff)

1. **Throttle background assess on large save-only batches** — every saved row still fires `/api/assess-accomplishment` (same as single-entry create, including Generate EPB handoff). For very large batches, consider capping concurrency (e.g. 3) so credits/UI don’t stampede.
2. **Batch create server action** — sequential `createAccomplishment` is correct but slow for large extracts; a single authenticated action with shared ratee/auth checks would cut round-trips (keep per-row sensitive validation).
3. **Stewardship fields in review** — extract returns a flat `impact` string; optional later: map into stewardship time/money/resources/outcome when the model returns structured impact.
4. **Partial-save UX** — if mid-batch create fails, already-saved rows stay and `onSaved(created, false)` runs; surface a clearer “saved N of M” toast + keep review open for failed remainder.

## Verification

- `npx vitest run src/lib/__tests__/extract-accomplishments.test.ts`
- `npm run motion:check`
- `npx react-doctor@latest --verbose --scope changed`
- Manual: paste bullets / award dump → extract → combine two → Save & open Generate EPB shows those IDs preselected
